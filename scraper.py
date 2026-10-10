#!/usr/bin/env python3
"""Buscador de departamentos en venta (Zonaprop + Argenprop + Mercado Libre) con aviso por Telegram.

Uso:
    python scraper.py                    # corrida normal (usa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)
    python scraper.py --dry-run          # no manda Telegram ni guarda estado, imprime en consola
    python scraper.py --only argenprop   # solo Argenprop (para cron/launchd en la Mac)
    python scraper.py --only mercadolibre
"""
from __future__ import annotations

import argparse
import html
import json
import os
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.json"


def load_dotenv(path: Path | None = None) -> None:
    """Carga .env sin pisar variables ya exportadas. launchd no puede `source` archivos en Documents."""
    env_path = path or (ROOT / ".env")
    try:
        raw = env_path.read_text()
    except OSError:
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


load_dotenv()
OLD_SEEN_PATH = ROOT / "seen.json"
STATE_DIR = ROOT / "state"
WEB_DATA_DIR = ROOT / "web" / "data"
WEEKLY_PATH = STATE_DIR / "weekly.json"

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)
BLOCK_MARKERS = (
    "just a moment",
    "cf-chl",
    "attention required",
    "request blocked",
    "awswaf",
    "access denied",
    "captcha",
)

LINK_RE = {
    # Argenprop: .../departamento-en-venta-en-recoleta-3-ambientes--19596287
    "argenprop": re.compile(r"/[a-z0-9-]+-en-venta-[^?#\s]*--(\d+)(?:[?#].*)?$", re.I),
    # Zonaprop: /propiedades/clasificado/veclapin-...-59790826.html
    "zonaprop": re.compile(r"/propiedades/clasificado/[^?#\s]*?-(\d{6,10})\.html", re.I),
    # Mercado Libre: /MLA-4032113512-en-venta-...-_JM
    "mercadolibre": re.compile(r"/MLA-(\d{8,12})(?:-|_JM)", re.I),
}

SITE_LABELS = {
    "argenprop": "Argenprop",
    "zonaprop": "Zonaprop",
    "mercadolibre": "Mercado Libre",
}


# ----------------------------------------------------------------- parsing --

def to_float(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".")) if re.search(r",\d{1,2}$", s) else float(s.replace(",", "."))


def to_price(s: str) -> int:
    return int(s.replace(".", "").replace(",", ""))


def card_for(link, link_re):
    """Sube por el DOM hasta el contenedor más grande que contiene un solo aviso."""
    node = link
    for _ in range(8):
        parent = node.parent
        if parent is None:
            break
        ids = set()
        for a in parent.find_all("a", href=True):
            m = link_re.search(a["href"])
            if m:
                ids.add(m.group(1))
        if len(ids) > 1:
            break
        node = parent
    return node


def parse_price(text: str) -> int | None:
    """Lee un precio en USD. Ignora 'desde USD', 'Consultar' y trozos tipo 'USD 1'."""
    if re.search(r"consultar\s+precio", text, re.I) and not re.search(r"USD\s*\d", text, re.I):
        return None
    # miles con punto (1.250.000) o al menos 4 dígitos seguidos; no "USD 1"
    for m in re.finditer(
        r"(desde\s+|hasta\s+)?(?:USD|US\$)\s*(\d{1,3}(?:\.\d{3})+|\d{4,})",
        text,
        re.I,
    ):
        if m.group(1):
            continue
        try:
            return to_price(m.group(2))
        except ValueError:
            continue
    return None


def price_from_card(card) -> int | None:
    """Precio actual de la card (nodo de precio), no el tachado ni el tope del listado."""
    if card is None:
        return None
    node = card.select_one(
        '[class*="postingPrices-module__price"]:not([class*="expenses"])'
    )
    if node is None:
        return None
    clone = BeautifulSoup(str(node), "html.parser")
    for struck in clone.find_all(["del", "s"]):
        struck.decompose()
    return parse_price(clone.get_text(" ", strip=True))


def parse_expensas(text: str, card=None, min_valid: int | None = None) -> tuple[int | None, str]:
    """Expensas en ARS tal como se publican. Vacío si la card no las muestra o es placeholder."""
    chunks = []
    if card is not None:
        node = card.select_one('[class*="expenses"]')
        if node:
            chunks.append(node.get_text(" ", strip=True))
    chunks.append(text or "")
    for chunk in chunks:
        m = re.search(r"\$\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*expensas", chunk, re.I)
        if m:
            n = to_price(m.group(1))
            floor = EXPENSAS_MIN_VALID_ARS if min_valid is None else min_valid
            if n is None or n < floor:
                return None, ""
            return n, re.sub(r"\s+", " ", m.group(0)).strip()
    return None, ""


def normalize_expensas(item: dict, cfg: dict | None = None) -> dict:
    floor = int((cfg or {}).get("expensas_min_valid_ars") or EXPENSAS_MIN_VALID_ARS)
    n = item.get("expensas_ars")
    if n is not None and n < floor:
        item["expensas_ars"] = None
        item["expensas_text"] = ""
    return item


def parse_piso(text: str) -> int | None:
    t = text or ""
    if re.search(r"\bplanta baja\b", t, re.I):
        return 0
    m = re.search(r"(\d{1,2})\s*°\s*piso\b", t, re.I) or re.search(
        r"\bpiso\s+(\d{1,2})\b", t, re.I
    )
    if m:
        n = int(m.group(1))
        return n if 0 <= n <= 40 else None
    return None


def parse_cochera(text: str) -> bool | None:
    hay = fold(text)
    if "sin cochera" in hay or "sin cocheras" in hay:
        return False
    if re.search(r"(?<![a-z])cocheras?(?![a-z])", hay):
        return True
    return None


def parse_antiguedad(text: str) -> int | None:
    hay = fold(text)
    if re.search(r"\ba estrenar\b", hay):
        return 0
    m = re.search(r"(?:^|[\s\-•|,])(\d{1,3})\s*años(?:[\s\-•|,]|$)", text or "", re.I)
    if not m:
        return None
    n = int(m.group(1))
    return n if n <= 200 else None


def parse_areas(site: str, text: str, cfg: dict | None = None) -> dict:
    """Cubiertos, semicubiertos y totales. Deal pondera como Mudafy si hay desglose."""
    blob = text or ""
    total = covered = semi = None
    tot = re.search(r"([\d.,]+)\s*m²\s*(?:tot(?:ales?)?\.?|tot\b)", blob, re.I)
    cub = re.search(r"([\d.,]+)\s*m²\s*(?:cubiert|cubie)", blob, re.I)
    constr = re.search(r"([\d.,]+)\s*m²\s*(?:de\s+)?superficie\s+constru", blob, re.I)
    sm = re.search(r"([\d.,]+)\s*m²\s*semicubiert", blob, re.I)
    if tot:
        total = to_float(tot.group(1))
    if cub:
        covered = to_float(cub.group(1))
    elif constr:
        covered = to_float(constr.group(1))
    if sm:
        semi = to_float(sm.group(1))
    if site == "argenprop" and covered is None:
        cub = re.search(r"([\d.,]+)\s*m²\s*cubie", blob)
        if cub:
            covered = to_float(cub.group(1))
    if site == "mercadolibre" and covered is None:
        cub = re.search(r"([\d.,]+)\s*m²\s*cubiert", blob, re.I)
        if cub:
            covered = to_float(cub.group(1))
    deal = weighted_area(covered, semi, total, cfg)
    return {"area": deal, "area_total": total, "area_covered": covered, "area_semi": semi}


def weighted_area(
    covered: float | None,
    semi: float | None,
    total: float | None,
    cfg: dict | None = None,
) -> float | None:
    """Mudafy: cubierto 100%, semi 50%, descubierto 30%. Sin desglose no se inventa."""
    cfg = cfg or {}
    w_c = float(cfg.get("area_weight_covered", 1))
    w_s = float(cfg.get("area_weight_semi", 0.5))
    w_u = float(cfg.get("area_weight_uncovered", 0.3))
    if covered is not None and semi is not None and total is not None:
        uncovered = max(0.0, total - covered - semi)
        return covered * w_c + semi * w_s + uncovered * w_u
    if covered is not None and semi is not None:
        return covered * w_c + semi * w_s
    if covered is not None:
        return covered * w_c
    return total


def _zonaprop_address(text: str) -> str:
    """Línea de dirección de la card, no el título de marketing ni el slug."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    barrios = (
        "capital federal",
        "caba",
        "botánico",
        "botanico",
        "recoleta",
        "barrio norte",
        "palermo chico",
        "palermo",
    )
    candidates: list[str] = []
    for i, ln in enumerate(lines[:-1]):
        nxt = fold(lines[i + 1])
        if any(b in nxt for b in barrios) and 3 <= len(ln) < 80:
            candidates.append(ln)
    def score_line(ln: str) -> tuple:
        t = fold(ln)
        noisy = bool(re.search(r"oportunidad|venta departamento|excelente|luminoso|semipiso", t))
        looks = bool(re.search(r"[a-z]{2,}.+\d{2,5}", t)) and not noisy
        return (int(looks), int(not noisy), int(len(ln) < 40), -len(ln))
    if candidates:
        candidates.sort(key=score_line, reverse=True)
        return candidates[0]
    m = re.search(
        r"\n([^\n]{3,80})\n[^\n]*(?:Capital Federal|CABA|Botánico|Botanico|Recoleta|Barrio Norte|Palermo Chico|Palermo)\b",
        text or "",
    )
    if m and len(m.group(1)) < 80 and not re.search(r"oportunidad|venta departamento", m.group(1), re.I):
        return m.group(1).strip()
    return ""


def parse_card(site: str, text: str, card=None) -> dict:
    out = {
        "price": None,
        "area": None,
        "area_total": None,
        "area_covered": None,
        "area_semi": None,
        "ambientes": None,
        "address": "",
        "expensas_ars": None,
        "expensas_text": "",
        "antiguedad_years": None,
        "piso": None,
        "cochera": None,
        "price_source": "card",
    }
    out["price"] = price_from_card(card) or parse_price(text)
    exp_n, exp_t = parse_expensas(text, card)
    out["expensas_ars"] = exp_n
    out["expensas_text"] = exp_t
    out["piso"] = parse_piso(text)
    out["cochera"] = parse_cochera(text)
    out["antiguedad_years"] = parse_antiguedad(text)

    parsed = parse_areas(site, text)
    out.update(parsed)
    if site == "argenprop":
        m = re.search(r"de\s+(\d+)\s+ambientes", text) or re.search(r"(\d+)\s*(?:ambientes|amb\.)", text, re.I)
    elif site == "mercadolibre":
        m = re.search(r"(\d+)\s*ambs?\b", text, re.I) or re.search(r"(\d+)\s*ambientes", text, re.I)
    else:
        m = re.search(r"(\d+)\s*amb\.", text) or re.search(r"(\d+)\s*ambientes", text, re.I)
    if m:
        out["ambientes"] = int(m.group(1))
    elif re.search(r"monoambiente", text, re.I):
        out["ambientes"] = 1

    if site == "argenprop":
        m = re.search(r"dormitorios?\s+(.+?)\s+USD", text.replace("\n", " "))
        if m and len(m.group(1)) < 120:
            out["address"] = m.group(1).strip()
    elif site == "mercadolibre":
        m = re.search(
            r"m² cubiertos\s+(.+?)(?:\s+Destacado|\s+PUBLICADO|$)",
            text,
            re.I,
        ) or re.search(
            r"((?:Av\.?\s+|Avenida\s+)?[A-Za-zÁÉÍÓÚÑáéíóúñ.]+\s+\d{2,5}[^,]{0,40},\s*(?:Recoleta|Barrio Norte|Botánico|Botanico|Palermo Chico))",
            text,
        )
        if m and len(m.group(1)) < 120:
            out["address"] = re.sub(r"\s+", " ", m.group(1)).strip()
    else:
        out["address"] = _zonaprop_address(text)
    return out


def card_photo(card, base_url: str) -> str:
    """Primera foto usable de la card. Vacío si no hay (logo / placeholder no cuenta)."""
    parts = base_url.split("/", 3)
    host = f"{parts[0]}//{parts[2]}" if len(parts) > 2 else ""
    skip = ("logo", "icon", "sprite", "placeholder", "1x1", "pixel")
    candidates: list[str] = []
    for script in card.find_all("script"):
        blob = script.string or script.get_text() or ""
        m = re.search(r'"image"\s*:\s*"(https://[^"]+)"', blob)
        if m:
            candidates.append(m.group(1))
    for img in card.find_all("img"):
        raw = img.get("src") or img.get("data-src") or img.get("data-lazy") or ""
        if not raw and img.get("srcset"):
            raw = img["srcset"].split(",")[0].split()[0]
        if raw:
            candidates.append(raw)
    for src in candidates:
        src = src.strip()
        if src.startswith("data:") or not src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = host + src
        low = src.lower()
        if not src.startswith("http") or any(s in low for s in skip):
            continue
        return src.split("?")[0] if "http" in src else src
    return ""


def parse_page(html_text: str, site: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")
    link_re = LINK_RE[site]
    listings: dict[str, dict] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = link_re.search(href)
        if not m:
            continue
        if site == "zonaprop" and "/emprendimiento/" in href:
            continue
        lid = f"{site}:{m.group(1)}"
        if lid in listings:
            continue
        card = card_for(a, link_re)
        sep_text = card.get_text("\n", strip=True)
        flat_text = re.sub(r"\s+", " ", sep_text)
        if site == "mercadolibre" and re.search(r"\bEMPRENDIMIENTO\b", sep_text):
            continue
        data = parse_card(site, sep_text if site == "zonaprop" else flat_text, card)
        if data["price"] is None:
            continue  # sin precio en USD: no se puede comparar
        url = href if href.startswith("http") else base_url.split("/", 3)[0] + "//" + base_url.split("/")[2] + href
        url = url.split("?")[0]
        title = re.sub(r"^[-\s]+", "", a.get_text(" ", strip=True))[:90]
        item = {
            "id": lid,
            "site": site,
            "url": url,
            "title": title,
            "blurb": (sep_text if site == "zonaprop" else flat_text)[:500],
            "photo": card_photo(card, url),
            **data,
        }
        item.update(parse_areas(site, f"{title}\n{sep_text if site == 'zonaprop' else flat_text}"))
        listings[lid] = item
    return list(listings.values())


# --------------------------------------------------------------- filtering --
# Excluyente: balcón (búsqueda del portal + “sin balcón” en el texto),
# ambientes, m², techo duro de precio. 125k es preferido, no corte.

def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def _haystack(item: dict, where: str) -> str:
    slug = re.sub(r"[-_./]+", " ", item.get("url") or "")
    title = f"{item.get('title') or ''} {slug}"
    if where == "title":
        return fold(title)
    extra = f"{item.get('blurb') or ''} {item.get('address') or ''}"
    return fold(f"{title} {extra}")


def _location_hay(item: dict) -> str:
    """Dirección + URL (y zona). No incluye título ni descripción."""
    slug = re.sub(r"[-_./]+", " ", item.get("url") or "")
    return fold(f"{item.get('address') or ''} {item.get('zone') or ''} {slug}")


def apply_budget(item: dict, f: dict) -> dict:
    """125k es el gusto; pasarse un poco baja el ranking, no saca el aviso."""
    preferred = f.get("max_price_usd")
    hard = f.get("max_price_usd_hard", preferred)
    price = item.get("price")
    if not preferred or price is None or price <= preferred:
        return item
    span = max((hard or preferred) - preferred, 1)
    over = price - preferred
    penalty = -max(1, round(2 * over / span))  # -1 cerca de 125k, -2 cerca del techo
    item["score"] = item.get("score", 0) + penalty
    tags = item.setdefault("tags", [])
    if "sobre presupuesto" not in tags:
        tags.append("sobre presupuesto")
    return item


def apply_signals(item: dict, signals: list, filters: dict | None = None) -> dict:
    """Etiqueta el aviso. No filtra: un score bajo igual entra si pasa matches()."""
    hits: list[dict] = []
    for sig in signals or []:
        hay = _haystack(item, sig.get("where") or "any")
        if any(fold(k) in hay for k in sig.get("keywords") or [] if k.strip()):
            hits.append(sig)
    ids = {s["id"] for s in hits if s.get("id")}
    # "edificio a reciclar" no es el depto a reciclar que buscamos
    if "edificio_malo" in ids:
        hits = [s for s in hits if s.get("id") != "reciclar"]
    item["score"] = sum(s.get("weight", 0) for s in hits)
    item["tags"] = [s["label"] for s in hits if s.get("label")]
    hay = _haystack(item, "any")
    if item.get("cochera") is True or (
        re.search(r"(?<![a-z])cocheras?(?![a-z])", hay) and "sin cochera" not in hay
    ):
        if "incluye cochera" not in item["tags"]:
            item["tags"].append("incluye cochera")
    if item.get("area_covered") is None and item.get("area") is not None:
        if "m² sin verificar" not in item["tags"]:
            item["tags"].append("m² sin verificar")
    mark_address_conflict(item, filters)
    if filters:
        apply_budget(item, filters)
        mark_claimed_barrio(item, filters)
    return item


def mark_claimed_barrio(item: dict, f: dict | None = None) -> dict:
    """El título/URL dice Recoleta; la calle es otra. O nombra Once/Abasto en el título."""
    f = f or {}
    tags = item.setdefault("tags", [])
    title = fold(f"{item.get('title') or ''} {item.get('url') or ''}")
    claimed_bad = False
    for kw in f.get("reject_barrios") or []:
        k = fold(str(kw))
        if not k or not _phrase_in(title, k):
            continue
        if re.search(rf"a pasos de\s+{re.escape(k)}", title):
            continue
        claimed_bad = True
        break
    if claimed_bad and "barrio del aviso no coincide" not in tags:
        tags.append("barrio del aviso no coincide")
    return item


VALUE_TAGS = {
    "metro barato": 1,
    "metro muy barato": 2,
    "metro caro": -1,
    "metro sospechoso": -1,
    "expensas altas": -1,
    "expensas muy altas": -2,
}

FLIP_TAGS = {
    "aire amplio": 3,
    "aire": 2,
    "sin aire": -2,
    "tesis": 2,
    "planta baja": -1,
    "zona floja": -4,
}

DEFAULT_EXIT_USD_M2 = {
    "Recoleta": 2750,
    "Barrio Norte": 2750,
    "Botánico": 3000,
    "Palermo Chico": 3600,
}
DEFAULT_RENO_USD_M2_RECYCLE = 375
DEFAULT_RENO_USD_M2_OK = 250
DEFAULT_RENO_USD_M2_RECYCLE_HARD = 550
DEFAULT_RENO_USD_M2_OK_HARD = 300
DEFAULT_AIR_OK_USD = 25000
DEFAULT_AIR_WIDE_USD = 40000
DEFAULT_WEAK_STREETS = ({"street": "paso"}, {"street": "jean jaures"}, {"street": "jean jaure"})
DEFAULT_WEAK_STREET_EXIT_USD_M2 = 2200
EXPENSAS_MIN_VALID_ARS = 10000
VALUE_SUSPECT_PCT = -30


def apply_value(item: dict, cfg: dict | None = None) -> dict:
    """Suma o resta según m² vs el barrio y expensas. Se puede correr dos veces."""
    cfg = cfg or {}
    tags = list(item.get("tags") or [])
    score = item.get("score") or 0
    kept: list[str] = []
    for t in tags:
        if t in VALUE_TAGS:
            score -= VALUE_TAGS[t]
        else:
            kept.append(t)
    cheap = int(cfg.get("value_cheap_pct", -8))
    steal = int(cfg.get("value_steal_pct", -15))
    rich = int(cfg.get("value_rich_pct", 20))
    exp_high = int(cfg.get("expensas_high_ars", 300000))
    exp_loud = int(cfg.get("expensas_loud_ars", 380000))
    vs = item.get("vs_median_pct")
    suspect = int(cfg.get("value_suspect_pct", VALUE_SUSPECT_PCT))
    added: list[str] = []
    if vs is not None:
        if vs <= suspect:
            added.append("metro sospechoso")
        elif vs <= steal:
            added.append("metro muy barato")
        elif vs <= cheap:
            added.append("metro barato")
        elif vs >= rich:
            added.append("metro caro")
    exp = item.get("expensas_ars")
    if exp is not None:
        if exp >= exp_loud:
            added.append("expensas muy altas")
        elif exp >= exp_high:
            added.append("expensas altas")
    for t in added:
        score += VALUE_TAGS[t]
        kept.append(t)
    item["score"] = score
    item["tags"] = kept
    return item


def street_name_of(item: dict) -> str:
    key = street_key(item.get("address") or "") or street_key(item.get("title") or "")
    if not key:
        return ""
    return re.sub(r"\s+\d+$", "", key).strip()


def _weak_rules(cfg: dict | None = None) -> list[dict]:
    raw = (cfg or {}).get("weak_streets")
    if raw is None:
        raw = DEFAULT_WEAK_STREETS
    rules: list[dict] = []
    for x in raw or []:
        if isinstance(x, dict) and x.get("street"):
            rules.append(x)
        elif isinstance(x, str) and x.strip():
            rules.append({"street": x.strip()})
    return rules


def is_weak_street(item: dict, cfg: dict | None = None) -> bool:
    """Borde Once/Abasto: el depto puede servir; la cuadra no paga salida de Recoleta/BN."""
    name, num = parse_street(item.get("address") or "")
    if not name:
        name, num = parse_street(item.get("title") or "")
    if not name:
        return False
    hay = fold(f"{item.get('address') or ''} {item.get('title') or ''}")
    for rule in _weak_rules(cfg):
        if _rule_hits(rule, name, num):
            return True
        st = fold(rule.get("street") or "")
        if num is None and st and re.search(rf"(?<![a-z0-9]){re.escape(st)}\s+\d{{2,5}}\b", hay):
            if rule.get("min") is None and rule.get("max") is None:
                return True
    return False


def exit_usd_m2_of(zone: str, cfg: dict | None = None, item: dict | None = None) -> int | None:
    cfg = cfg or {}
    if item is not None and is_weak_street(item, cfg):
        return int(cfg.get("weak_street_exit_usd_m2", DEFAULT_WEAK_STREET_EXIT_USD_M2))
    mapping = cfg.get("exit_usd_m2") or DEFAULT_EXIT_USD_M2
    if zone in mapping:
        return int(mapping[zone])
    return None


def deal_area(item: dict) -> float | None:
    for key in ("area", "area_covered"):
        v = item.get(key)
        if v is not None and v > 0:
            return float(v)
    return None


def reno_usd_m2_of(item: dict, cfg: dict | None = None, *, hard: bool = False) -> int:
    cfg = cfg or {}
    tags = item.get("tags") or []
    recycle = "para reciclar" in tags
    finished = "ya hecho" in tags or ("edificio ok" in tags and not recycle)
    if recycle or not finished:
        key = "reno_usd_m2_recycle_hard" if hard else "reno_usd_m2_recycle"
        fallback = DEFAULT_RENO_USD_M2_RECYCLE_HARD if hard else DEFAULT_RENO_USD_M2_RECYCLE
        return int(cfg.get(key, fallback))
    key = "reno_usd_m2_ok_hard" if hard else "reno_usd_m2_ok"
    fallback = DEFAULT_RENO_USD_M2_OK_HARD if hard else DEFAULT_RENO_USD_M2_OK
    return int(cfg.get(key, fallback))


def hold_usd_of(item: dict, cfg: dict | None = None, *, hard: bool = False) -> float:
    cfg = cfg or {}
    exp = item.get("expensas_ars")
    fx = float(cfg.get("fx_ars_usd") or 0)
    if exp is None or fx <= 0:
        return 0.0
    months = int(cfg.get("hold_months_hard" if hard else "hold_months", 9 if hard else 6))
    return (exp / fx) * months


def air_usd_of(item: dict, cfg: dict | None = None) -> int | None:
    cfg = cfg or {}
    if "incluye cochera" in (item.get("tags") or []):
        return None
    price = item.get("price")
    area = deal_area(item)
    exit_m2 = exit_usd_m2_of(item.get("zone") or "", cfg, item)
    if price is None or area is None or area <= 0 or exit_m2 is None:
        return None
    reno = reno_usd_m2_of(item, cfg, hard=False)
    return int(round(exit_m2 * area - price - reno * area))


def apply_air(item: dict, cfg: dict | None = None) -> dict:
    """Aire (salida − compra − obra), combo edificio+reciclar y PB. Se puede correr dos veces."""
    cfg = cfg or {}
    tags = list(item.get("tags") or [])
    score = item.get("score") or 0
    kept: list[str] = []
    for t in tags:
        if t in FLIP_TAGS:
            score -= FLIP_TAGS[t]
        else:
            kept.append(t)
    reno = reno_usd_m2_of(item, cfg, hard=False)
    exit_m2 = exit_usd_m2_of(item.get("zone") or "", cfg, item)
    air = air_usd_of(item, cfg)
    item["air_usd"] = air
    item["exit_usd_m2"] = exit_m2
    item["reno_usd_m2"] = reno
    added: list[str] = []
    if air is not None:
        wide = int(cfg.get("air_wide_usd", DEFAULT_AIR_WIDE_USD))
        ok = int(cfg.get("air_ok_usd", DEFAULT_AIR_OK_USD))
        if air >= wide:
            added.append("aire amplio")
        elif air >= ok:
            added.append("aire")
        elif air < 0:
            added.append("sin aire")
    if "para reciclar" in kept and "edificio ok" in kept and "tesis" not in kept:
        added.append("tesis")
    if item.get("piso") == 0 and "planta baja" not in kept:
        added.append("planta baja")
    if is_weak_street(item, cfg) and "zona floja" not in kept:
        added.append("zona floja")
    for t in added:
        score += FLIP_TAGS.get(t, 0)
        kept.append(t)
    item["score"] = score
    item["tags"] = kept
    apply_net(item, cfg)
    return item


def flip_result(item: dict, cfg: dict | None = None, *, hard: bool = False) -> dict | None:
    """Neto antes de impuestos. Supuestos en config.json."""
    cfg = cfg or {}
    if "incluye cochera" in (item.get("tags") or []):
        return None
    price = item.get("price")
    area = deal_area(item)
    exit_m2 = exit_usd_m2_of(item.get("zone") or "", cfg, item)
    if price is None or area is None or area <= 0 or exit_m2 is None:
        return None
    buy = float(cfg.get("buy_cost_pct_hard" if hard else "buy_cost_pct", 8 if hard else 5)) / 100.0
    sale = float(cfg.get("sale_cost_pct_hard" if hard else "sale_cost_pct", 6 if hard else 5)) / 100.0
    closing = float(cfg.get("closing_discount_pct", 3.9)) / 100.0 if hard else 0.0
    reno = reno_usd_m2_of(item, cfg, hard=hard)
    hold = hold_usd_of(item, cfg, hard=hard)
    proceeds = exit_m2 * area * (1 - closing) * (1 - sale)
    cost = price * (1 + buy) + reno * area + hold
    neto = proceeds - cost
    roi = (neto / cost) if cost else None
    denom = area * (1 - closing) * (1 - sale)
    breakeven = (cost / denom) if denom else None
    offer = (proceeds - reno * area - hold) / (1 + buy) if (1 + buy) else None
    return {
        "neto": int(round(neto)),
        "roi": None if roi is None else round(roi, 4),
        "breakeven": None if breakeven is None else int(round(breakeven)),
        "reno": reno,
        "max_offer": None if offer is None else int(round(offer)),
    }


def seventy_offer_of(item: dict, cfg: dict | None = None) -> int | None:
    """Regla 70%: control, no veto (FlipperForce)."""
    cfg = cfg or {}
    area = deal_area(item)
    exit_m2 = exit_usd_m2_of(item.get("zone") or "", cfg, item)
    if area is None or area <= 0 or exit_m2 is None:
        return None
    pct = float(cfg.get("rule_70_pct", 70)) / 100.0
    reno = reno_usd_m2_of(item, cfg, hard=False)
    return int(round(pct * exit_m2 * area - reno * area))


def decision_of(price: int | None, max_offer: int | None, cfg: dict | None = None) -> str | None:
    cfg = cfg or {}
    if price is None or max_offer is None or max_offer <= 0:
        return None
    buy_cut = float(cfg.get("decision_buy_pct", 92)) / 100.0
    watch_cut = float(cfg.get("decision_watch_pct", 108)) / 100.0
    ratio = price / max_offer
    if ratio <= buy_cut:
        return "comprar"
    if price <= max_offer:
        return "negociar"
    if ratio <= watch_cut:
        return "vigilar"
    return "descartar"


def apply_net(item: dict, cfg: dict | None = None) -> dict:
    cfg = cfg or {}
    base = flip_result(item, cfg, hard=False)
    hard = flip_result(item, cfg, hard=True)
    item["neto_base_usd"] = None if base is None else base["neto"]
    item["neto_hard_usd"] = None if hard is None else hard["neto"]
    item["roi_base"] = None if base is None else base["roi"]
    item["roi_hard"] = None if hard is None else hard["roi"]
    item["breakeven_exit_usd_m2"] = None if hard is None else hard["breakeven"]
    item["breakeven_exit_usd_m2_base"] = None if base is None else base["breakeven"]
    item["max_offer_usd"] = None if hard is None else hard["max_offer"]
    item["seventy_offer_usd"] = seventy_offer_of(item, cfg)
    item["decision"] = decision_of(item.get("price"), item.get("max_offer_usd"), cfg)
    return item


def prefer(items: list[dict]) -> list[dict]:
    def key(x: dict):
        neto = x.get("neto_hard_usd")
        air = x.get("air_usd")
        return (
            -10**12 if neto is None else neto,
            -10**12 if air is None else air,
            x.get("score") or 0,
            -(x["price"] if x.get("price") is not None else 10**12),
        )
    return sorted(items, key=key, reverse=True)


def keep_flip(item: dict) -> bool:
    """Corta lo que no se da vuelta o no está en una cuadra que pague."""
    tags = item.get("tags") or []
    if "metro caro" in tags:
        return False
    if "zona floja" in tags or "barrio del aviso no coincide" in tags:
        return False
    if item.get("zone_unverified"):
        return False
    return True


def join_es(parts: list[str]) -> str:
    bits = [p for p in parts if p]
    if not bits:
        return ""
    if len(bits) == 1:
        return bits[0]
    return ", ".join(bits[:-1]) + " y " + bits[-1]


_VERDICT_SAY = {
    "de época": "es de época",
    "para reciclar": "está para reciclar",
    "edificio ok": "el edificio está en buen estado",
    "edificio flojo": "el edificio está flojo",
    "edificio a reciclar": "el edificio está para reciclar",
    "planta baja": "es planta baja",
    "sobre presupuesto": "está sobre el presupuesto",
    "metro barato": "el metro está barato para el barrio",
    "metro muy barato": "el metro está muy barato para el barrio",
    "metro caro": "el metro está caro para el barrio",
    "expensas altas": "las expensas son altas",
    "expensas muy altas": "las expensas son muy altas",
    "aire": "queda margen para comprarlo, reformarlo y venderlo",
    "aire amplio": "queda bastante margen para comprarlo, reformarlo y venderlo",
    "sin aire": "al precio de hoy no alcanza para la obra y la reventa",
    "ya hecho": "ya está reciclado o a estrenar",
    "tesis": "es el combo: buen edificio y unidad a reciclar",
    "zona floja": "la cuadra no paga la salida del barrio",
    "barrio del aviso no coincide": "el aviso dice un barrio; la calle es otra",
    "metro sospechoso": "verificar la cuadra: precio por debajo de lo que paga la zona",
    "m² sin verificar": "los m² son totales; no vimos cubiertos",
    "incluye cochera": "el precio incluye cochera",
    "ocupado": "está ocupado o se vende con renta",
    "cumple barrio, metros y balcón": "pasa barrio, metros y balcón; no hay más señales",
}
_FALTA_SAY = {
    "foto": "la foto",
    "expensas": "las expensas",
    "piso": "el piso",
    "metros": "los metros",
}


def _say_hit(tag: str) -> str:
    return _VERDICT_SAY.get(tag, tag)


def verdict(item: dict, cfg: dict | None = None) -> dict:
    """Frases claras para el equipo. No es un sello del portal."""
    filters = (cfg or {}).get("filters") or {}
    gusto = filters.get("max_price_usd") or 125000
    tags = [t for t in (item.get("tags") or []) if t]
    entra: list[str] = []
    resta: list[str] = []
    falta: list[str] = []
    for t in tags:
        if t == "sobre presupuesto":
            price = item.get("price")
            if price is not None:
                resta.append(f"pide USD {_fmt_int(int(price))} y el gusto es USD {_fmt_int(int(gusto))}")
            else:
                resta.append(_say_hit(t))
        elif t in {
            "edificio flojo",
            "edificio a reciclar",
            "metro caro",
            "expensas altas",
            "expensas muy altas",
            "sin aire",
            "ya hecho",
            "planta baja",
            "zona floja",
            "barrio del aviso no coincide",
            "metro sospechoso",
            "ocupado",
            "incluye cochera",
        }:
            resta.append(_say_hit(t))
        elif t == "m² sin verificar":
            falta.append(_say_hit(t))
        else:
            entra.append(_say_hit(t))
    if item.get("piso") == 0 and "es planta baja" not in resta:
        resta.append(_say_hit("planta baja"))
    if not entra and not resta:
        entra.append(_say_hit("cumple barrio, metros y balcón"))
    if not item.get("photo"):
        falta.append(_FALTA_SAY["foto"])
    floor = int((cfg or {}).get("expensas_min_valid_ars") or EXPENSAS_MIN_VALID_ARS)
    exp = item.get("expensas_ars")
    if exp is None or exp < floor:
        falta.append(_FALTA_SAY["expensas"])
    if item.get("piso") is None:
        falta.append(_FALTA_SAY["piso"])
    if deal_area(item) is None:
        falta.append(_FALTA_SAY["metros"])
    falta.append("el precio de la ficha interna")
    if item.get("address_unverified"):
        falta.append("verificar la dirección")
    if item.get("zone_unverified"):
        falta.append("la calle no confirma el barrio del aviso")
    parts = []
    if entra:
        parts.append("A favor: " + join_es(entra) + ".")
    if resta:
        parts.append("En contra: " + join_es(resta) + ".")
    if falta:
        parts.append("El aviso no dice: " + join_es(falta) + ".")
    air = item.get("air_usd")
    exit_m2 = item.get("exit_usd_m2")
    reno = item.get("reno_usd_m2")
    zone = item.get("zone") or ""
    if air is not None and exit_m2 and zone:
        reno_n = int(reno or reno_usd_m2_of(item, cfg, hard=False))
        leftover = (
            f"quedarían USD {_fmt_int(int(air))}"
            if air >= 0
            else f"faltarían USD {_fmt_int(int(abs(air)))}"
        )
        parts.append(
            f"Aire: {leftover} si lo comprás a este precio, le hacés una obra "
            f"(USD {_fmt_int(reno_n)}/m²) y lo vendés al metro de referencia de {zone} "
            f"(USD {_fmt_int(int(exit_m2))}). La salida es fija por barrio, no un comparable de la cuadra."
        )
    neto = item.get("neto_hard_usd")
    be = item.get("breakeven_exit_usd_m2")
    if neto is not None:
        sign = "USD " + _fmt_int(int(neto)) if neto >= 0 else "−USD " + _fmt_int(int(abs(neto)))
        bit = f"Neto duro {sign}."
        if be is not None:
            bit += f" Equilibrio USD {_fmt_int(int(be))}/m²."
        parts.append(bit)
    offer = item.get("max_offer_usd")
    if offer is not None:
        dec = item.get("decision") or ""
        label = {
            "comprar": "Comprar",
            "negociar": "Negociar",
            "vigilar": "Vigilar",
            "descartar": "Descartar",
        }.get(dec, "")
        bit = f"Oferta máxima USD {_fmt_int(int(offer))}."
        if label:
            bit += f" {label}."
        parts.append(bit)
    return {"entra": entra, "resta": resta, "falta": falta, "text": " ".join(parts)}


def empty_pick() -> dict:
    return {"id": None, "manual": False, "note": ""}


def load_pick() -> dict:
    data = _read_json(pick_path(), empty_pick())
    if not isinstance(data, dict):
        return empty_pick()
    return {
        "id": data.get("id") or None,
        "manual": bool(data.get("manual")),
        "note": data.get("note") or "",
    }


def resolve_pick_id(listings: list[dict], pick: dict | None = None) -> str | None:
    pick = pick if pick is not None else load_pick()
    active = [i for i in listings if i.get("id") and i.get("active") is not False]
    ids = {i["id"] for i in active}
    if pick.get("manual") and pick.get("id") in ids:
        return pick["id"]
    ranked = prefer([i for i in active if i.get("price") is not None])
    return ranked[0]["id"] if ranked else None


def save_pick(listings: list[dict]) -> dict:
    prev = load_pick()
    pid = resolve_pick_id(listings, prev)
    out = {
        "id": pid,
        "manual": bool(prev.get("manual") and prev.get("id") == pid),
        "note": prev.get("note") or "",
    }
    if not dump_equal(out, prev):
        write_json(pick_path(), out)
    return out


_STREET_NOISE = re.compile(
    r"\b(recoleta|barrio norte|botanico|palermo chico|palermo|capital federal|caba|"
    r"argentina|departamento|depto|ambientes|amb)\b"
)


def street_key(address: str) -> str:
    """Calle + altura, sin barrio. Vacío si no hay número (no se puede deduplicar)."""
    t = fold(address or "")
    t = t.replace("avenida", "av").replace("av.", "av ")
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"\bal\s+", " ", t)
    t = _STREET_NOISE.sub(" ", t)
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    m = re.search(r"([a-z]+(?:\s+[a-z]+){0,3})\s+(\d{2,5})\b", t)
    return f"{m.group(1)} {m.group(2)}" if m else ""


_STREET_ALIASES = (
    ("marcelo torcuato de alvear", "alvear"),
    ("general lucio norberto mansilla", "mansilla"),
    ("lucio mansilla", "mansilla"),
    ("jose antonio cabrera", "cabrera"),
    ("jose a cabrera", "cabrera"),
    ("av scalabrini ortiz", "scalabrini ortiz"),
    ("scalabrini", "scalabrini ortiz"),
    ("cnel diaz", "coronel diaz"),
    ("cnl diaz", "coronel diaz"),
    ("av las heras", "las heras"),
    ("av santa fe", "santa fe"),
    ("av cordoba", "cordoba"),
    ("av pueyrredon", "pueyrredon"),
    ("jose maria gutierrez", "gutierrez"),
    ("j m gutierrez", "gutierrez"),
    ("san martin de tours", "san martin de tours"),
    ("republica de la india", "republica de la india"),
    ("rodriguez pena", "rodriguez pena"),
    ("jean jaures", "jean jaures"),
    ("jean jaure", "jean jaures"),
    ("coronel diaz", "coronel diaz"),
    ("mario bravo", "mario bravo"),
    ("pacheco de melo", "pacheco de melo"),
    ("vicente lopez", "vicente lopez"),
)


def norm_street(name: str) -> str:
    n = fold(name or "")
    n = re.sub(r"\b(av|avenida)\b", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    for raw, canon in _STREET_ALIASES:
        if n == raw or n.startswith(raw + " "):
            return canon
    return n


def _street_names(f: dict | None = None) -> list[str]:
    names = {canon for _, canon in _STREET_ALIASES}
    names.update(raw for raw, _ in _STREET_ALIASES)
    for rule in (f or {}).get("street_zones") or []:
        st = fold(rule.get("street") or "")
        if st:
            names.add(st)
    return sorted(names, key=len, reverse=True)


def _clean_street_text(text: str) -> str:
    t = fold(text or "")
    t = t.replace("avenida", " ").replace("av.", " ")
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"\bal\s+", " ", t)
    t = _STREET_NOISE.sub(" ", t)
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _token_in(hay: str, phrase: str) -> bool:
    phrase = fold(phrase)
    if not phrase:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", fold(hay)) is not None


def _find_street(text: str, streets: list[str]) -> tuple[str, int | None]:
    t = _clean_street_text(text)
    if not t:
        return "", None
    best_name, best_num, best_score = "", None, -1
    for street in streets:
        for m in re.finditer(rf"(?<![a-z0-9]){re.escape(street)}(?![a-z0-9])", t):
            rest = t[m.end():].strip()
            nm = re.match(r"(\d{2,5})\b", rest)
            num = int(nm.group(1)) if nm else None
            score = len(street) * 10 + (5 if num is not None else 0)
            if score > best_score:
                best_name, best_num, best_score = street, num, score
    if best_name:
        return norm_street(best_name), best_num
    return "", None


def parse_street(text: str, f: dict | None = None) -> tuple[str, int | None]:
    streets = _street_names(f)
    key = street_key(text or "")
    if key:
        name, _, num = key.rpartition(" ")
        if num.isdigit():
            n = norm_street(name)
            if n in streets:
                return n, int(num)
            for st in streets:
                if n == st or n.endswith(" " + st):
                    return norm_street(st), int(num)
    found = _find_street(text or "", streets)
    if found[0]:
        return found
    t = _clean_street_text(text or "")
    if not t:
        return "", None
    m = re.search(r"^([a-z][a-z\s]*?)\s+(\d{2,5})\b", t)
    if m:
        return norm_street(m.group(1)), int(m.group(2))
    return norm_street(t), None


def mark_address_conflict(item: dict, f: dict | None = None) -> dict:
    """Card vs título vs slug: si la altura no coincide, hay que verificar."""
    addr_name, addr_num = parse_street(item.get("address") or "", f)
    title_name, title_num = parse_street(item.get("title") or "", f)
    slug = fold(re.sub(r"[-_./]+", " ", item.get("url") or ""))
    conflict = False
    if addr_name and title_name and addr_num and title_num:
        if addr_name == title_name and addr_num != title_num:
            conflict = True
    if addr_name and addr_num:
        m = re.search(rf"(?<![a-z0-9]){re.escape(addr_name)}\s+(\d{{2,5}})\b", slug)
        if m and int(m.group(1)) != addr_num:
            conflict = True
    item["address_unverified"] = conflict
    return item


def _rule_hits(rule: dict, name: str, num: int | None) -> bool:
    street = fold(rule.get("street") or "")
    if not street or not name:
        return False
    if not (name == street or name.startswith(street + " ") or street.startswith(name + " ")):
        return False
    if num is None:
        return rule.get("min") is None and rule.get("max") is None
    lo = rule.get("min")
    hi = rule.get("max")
    if lo is not None and num < int(lo):
        return False
    if hi is not None and num > int(hi):
        return False
    return True


def _out_only_streets(f: dict | None = None) -> set[str]:
    by: dict[str, list[dict]] = {}
    for rule in (f or {}).get("street_zones") or []:
        st = fold(rule.get("street") or "")
        if st:
            by.setdefault(st, []).append(rule)
    return {st for st, rules in by.items() if rules and all(r.get("out") for r in rules)}


def _mentions_out_street(text: str, f: dict | None = None) -> bool:
    """Calle 100% fuera, solo en la dirección (el título miente: 'a pasos de…')."""
    if not text:
        return False
    names = _street_names(f)
    out_only = _out_only_streets(f)
    for st in sorted(out_only, key=len, reverse=True):
        if not _token_in(text, st):
            continue
        longer = [x for x in names if x != st and x.startswith(st + " ") and _token_in(text, x)]
        if longer:
            continue
        return True
    return False


def _same_street(rule: dict, name: str) -> bool:
    return _rule_hits({**rule, "min": None, "max": None}, name, None)


def classify_zone(item: dict, f: dict | None = None) -> str | None:
    """Barrio por calle + altura. None = fuera. '' = no se pudo fijar. El aviso no manda."""
    f = f or {}
    rules = f.get("street_zones") or []
    address = item.get("address") or ""
    if _mentions_out_street(address, f):
        return None
    name, num = parse_street(address, f)
    if not name:
        name, num = parse_street(item.get("title") or "", f)
    if not name:
        return ""
    mine = [r for r in rules if _same_street(r, name)]
    if not mine:
        return ""
    ranged = [r for r in mine if r.get("min") is not None or r.get("max") is not None]
    pool = ranged if (num is not None and ranged) else mine
    hits = [r for r in pool if _rule_hits(r, name, num)]
    if not hits and num is not None:
        hits = [r for r in mine if r.get("out") and _rule_hits(r, name, None)]
    if not hits:
        return None if num is not None else ""
    hits.sort(
        key=lambda r: (len(fold(r.get("street") or "")), 1 if r.get("min") or r.get("max") else 0),
        reverse=True,
    )
    rule = hits[0]
    if rule.get("out"):
        return None
    return rule.get("zone") or ""


def apply_zone(item: dict, f: dict, src: dict | None = None) -> bool:
    """Escribe item['zone']. False si la calle está fuera de los 4 barrios."""
    z = classify_zone(item, f)
    name, num = parse_street(item.get("address") or "", f)
    if not name:
        name, num = parse_street(item.get("title") or "", f)
    if z is None:
        item["zone"] = ""
        item["zone_unverified"] = False
        return False
    if z:
        item["zone"] = z
        item["zone_unverified"] = False
        mark_claimed_barrio(item, f)
        return not is_rejected(item, f)
    # Sin tabla de calles no contradecimos el aviso. Con tabla, calle+altura que no entra no hereda Recoleta.
    if num is not None and (f.get("street_zones") or []):
        item["zone"] = ""
        item["zone_unverified"] = True
        return False
    if src:
        item["zone"] = source_zone(src)
    item["zone_unverified"] = True
    mark_claimed_barrio(item, f)
    return keep_zone(item, src or {}) and in_scope(item, f)


def listing_key(item: dict) -> str:
    street = street_key(item.get("address") or "")
    if not street or item.get("price") is None:
        return ""
    area = item.get("area")
    area_b = str(int(round(area))) if area is not None else "x"
    amb = item["ambientes"] if item.get("ambientes") is not None else "x"
    return f"{street}|{item['price']}|{area_b}|{amb}"


def place_key(item: dict) -> str:
    """Calle + m² (~5) + ambientes. Sirve para el mismo depto en otro portal."""
    street = street_key(item.get("address") or "") or street_key(item.get("title") or "")
    area = item.get("area")
    amb = item.get("ambientes")
    if not street or area is None or amb is None:
        return ""
    bucket = int(round(float(area) / 5.0) * 5)
    return f"{street}|{bucket}|{int(amb)}"


def places_from_other_portals(site: str) -> set[str]:
    known: set[str] = set()
    for other in SITES:
        if other == site:
            continue
        rows = load_portal(other, persist=False)[1].get("listings") or []
        for row in rows:
            pk = place_key(row)
            if pk:
                known.add(pk)
    return known


def _richer(a: dict, b: dict) -> bool:
    if a.get("score", 0) != b.get("score", 0):
        return a.get("score", 0) > b.get("score", 0)
    return len(a.get("address") or "") > len(b.get("address") or "")


def dedupe(items: list[dict]) -> list[dict]:
    """Un aviso por depto (mismo portal, otro portal, o Recoleta ∩ Barrio Norte)."""
    by_key: dict[str, dict] = {}
    leftover: list[dict] = []
    for i in items:
        k = listing_key(i)
        if not k:
            leftover.append(i)
            continue
        prev = by_key.get(k)
        if prev is None or _richer(i, prev):
            by_key[k] = i
    return prefer(list(by_key.values()) + leftover)


def find_prev(item: dict, state: dict) -> dict | None:
    listings = state.get("listings") or {}
    if item["id"] in listings:
        return listings[item["id"]]
    k = listing_key(item)
    if not k:
        return None
    for rec in listings.values():
        if rec.get("key") == k:
            return rec
    return None


def has_balcon(item: dict) -> bool | None:
    """True / False si el texto lo dice; None si la card no menciona balcón."""
    hay = _haystack(item, "any")
    if "sin balcon" in hay or "sin balcones" in hay:
        return False
    if "balcon" in hay or "balcones" in hay:
        return True
    return None


def zone_aliases(src: dict) -> list[str]:
    raw = src.get("aliases") or [src.get("name") or ""]
    return [fold(a) for a in raw if str(a).strip()]


def page_matches_zone(html_text: str, final_url: str, src: dict) -> bool:
    """True si el listado quedó en el barrio pedido (no un fallback nacional)."""
    soup = BeautifulSoup(html_text, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    h1 = soup.find("h1")
    h1t = h1.get_text(" ", strip=True) if h1 else ""
    heading = fold(f"{title} {h1t}")
    if "en venta en argentina" in heading:
        return False
    hay = fold(f"{final_url} {title} {h1t}")
    return any(a in hay for a in zone_aliases(src))


def keep_zone(item: dict, src: dict) -> bool:
    """Descarta cards cuyo barrio/dirección no coincide con la zona pedida."""
    aliases = zone_aliases(src)
    if not aliases:
        return True
    return any(a in _haystack(item, "any") for a in aliases)


def _phrase_in(hay: str, phrase: str) -> bool:
    phrase = fold(phrase)
    if not phrase:
        return False
    if " " in phrase or len(phrase) >= 6:
        return phrase in hay
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", hay) is not None


def _city_hay(item: dict) -> str:
    """Título + dirección + URL. No la descripción (puede mencionar otra ciudad)."""
    slug = re.sub(r"[-_./]+", " ", item.get("url") or "")
    return fold(f"{item.get('title') or ''} {item.get('address') or ''} {item.get('zone') or ''} {slug}")


def is_foreign_city(item: dict, f: dict) -> bool:
    """Otra ciudad (Rosario, etc.). 'Av. General Paz' en CABA no cuenta."""
    hay = _city_hay(item)
    for kw in f.get("reject_cities") or []:
        if not _phrase_in(hay, str(kw)):
            continue
        if fold(kw) == "general paz" and ("av general paz" in hay or "avenida general paz" in hay):
            continue
        return True
    return False


def is_rejected(item: dict, f: dict) -> bool:
    """Pozo/cuotas sobre el texto; otros barrios solo en dirección/URL."""
    text_kws = f.get("reject_text")
    if text_kws is None:
        text_kws = f.get("reject") or []
    hay = _haystack(item, "any")
    if any(_phrase_in(hay, kw) for kw in text_kws if str(kw).strip()):
        return True
    if is_foreign_city(item, f):
        return True
    loc = _location_hay(item)
    return any(_phrase_in(loc, kw) for kw in f.get("reject_barrios") or [] if str(kw).strip())


def in_allowed_area(item: dict, f: dict) -> bool:
    """Tiene que nombrar uno de los 4 barrios (todos CABA)."""
    allowed = [fold(b) for b in f.get("allowed_barrios") or [] if str(b).strip()]
    if not allowed:
        return True
    hay = _haystack(item, "any")
    zone = fold(item.get("zone") or "")
    return any(b in hay or b in zone for b in allowed)


def in_scope(item: dict, f: dict) -> bool:
    """Barrio pedido de CABA, y no otra ciudad."""
    return in_allowed_area(item, f) and not is_rejected(item, f)


def keep_listing(item: dict, src: dict, f: dict) -> bool:
    return apply_zone(item, f, src)


def matches(item: dict, f: dict) -> bool:
    hard = f.get("max_price_usd_hard", f["max_price_usd"])
    min_p = f.get("min_price_usd", 20000)
    if item["price"] is None or item["price"] > hard or item["price"] < min_p:
        return False
    if is_rejected(item, f) or not in_allowed_area(item, f):
        return False
    if item["ambientes"] is not None and item["ambientes"] > f["max_ambientes"]:
        return False
    if f.get("require_balcon"):
        bal = has_balcon(item)
        if bal is False:
            return False
        if bal is None and not f.get("include_unknown_balcon", True):
            return False
    max_e = f.get("max_expensas_ars")
    if max_e is not None and item.get("expensas_ars") is not None and item["expensas_ars"] > max_e:
        return False
    area = deal_area(item)
    if area is None:
        return bool(f.get("include_unknown_area", True))
    return area >= f["min_area_m2"]


# ----------------------------------------------------------- decision stats --

def usd_per_m2(price, area) -> int | None:
    if price is None or area is None or area <= 0:
        return None
    return int(round(price / area))


def median(values: list[float]) -> float | None:
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    mid = len(xs) // 2
    if len(xs) % 2:
        return float(xs[mid])
    return (xs[mid - 1] + xs[mid]) / 2.0


def listing_usd_m2(item: dict) -> int | None:
    return usd_per_m2(item.get("price"), deal_area(item))


def _median_skip(item: dict) -> bool:
    tags = item.get("tags") or []
    return "incluye cochera" in tags


def zone_medians(listings: list[dict], min_n: int = 8) -> dict[str, dict]:
    buckets: dict[str, list[int]] = {}
    for i in listings:
        if i.get("active") is False:
            continue
        if _median_skip(i):
            continue
        zone = i.get("zone") or ""
        u = listing_usd_m2(i)
        if not zone or u is None:
            continue
        buckets.setdefault(zone, []).append(u)
    out: dict[str, dict] = {}
    for zone, vals in buckets.items():
        if len(vals) < min_n:
            continue
        med = median(vals)
        if med is None:
            continue
        out[zone] = {"median": med, "n": len(vals)}
    return out


def days_seen(first_seen: str | None, now: str) -> int | None:
    if not first_seen:
        return None
    try:
        a = datetime.fromisoformat(first_seen[:19]).date()
        b = datetime.fromisoformat(now[:19]).date()
    except ValueError:
        return None
    return max(0, (b - a).days)


def price_drop_count(history: list | None) -> int:
    return max(0, len(history or []) - 1)


def closing_ref(price, pct) -> int | None:
    if price is None or pct is None:
        return None
    return int(round(price * (1 - float(pct) / 100.0)))


def apply_decision(item: dict, medians: dict[str, dict], cfg: dict, now: str) -> dict:
    """usd/m², vs mediana, días vistos, bajas y referencia de cierre."""
    u = listing_usd_m2(item)
    item["usd_per_m2"] = u
    info = medians.get(item.get("zone") or "")
    if u is not None and info and info.get("median"):
        item["vs_median_pct"] = int(round((u - info["median"]) * 100 / info["median"]))
        item["vs_median_n"] = info["n"]
    else:
        item["vs_median_pct"] = None
        item["vs_median_n"] = None
    first = item.get("first_seen")
    item["days_seen"] = days_seen(first, now)
    hist = list(item.get("price_history") or [])
    if item.get("old_price") and item.get("price") is not None:
        if not hist or hist[-1].get("price") != item["price"]:
            hist = hist + [{"date": now, "price": item["price"]}]
    item["price_drops"] = price_drop_count(hist)
    item["closing_ref_usd"] = closing_ref(item.get("price"), cfg.get("closing_discount_pct", 5))
    return item


def pool_for_median(matched: list[dict], extra: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    for i in extra + matched:
        if i.get("id"):
            by_id[i["id"]] = i
    return list(by_id.values())


def attach_decisions(items: list[dict], extra: list[dict], cfg: dict, now: str) -> dict[str, dict]:
    medians = zone_medians(pool_for_median(items, extra), cfg.get("median_min_n", 8))
    for i in items:
        apply_decision(i, medians, cfg, now)
        apply_value(i, cfg)
        apply_air(i, cfg)
    return medians


# ----------------------------------------------------------------- fetching --

PAGES_DEFAULT = 3
PAGES_MAX = {"zonaprop": 5, "argenprop": 3, "mercadolibre": 1}


def source_zone(src: dict) -> str:
    return (src.get("zone") or src.get("name") or "").strip()


def source_pages(src: dict, cfg: dict | None = None) -> int:
    """Páginas de una fuente. Default 3; tope = lo que permite robots.txt del portal."""
    _ = cfg
    site = src.get("site") or ""
    cap = PAGES_MAX.get(site)
    if cap is None:
        raise ValueError(f"portal desconocido: {site!r}")
    raw = src.get("pages", PAGES_DEFAULT)
    try:
        n = int(raw)
    except (TypeError, ValueError) as e:
        raise ValueError(f"pages inválido para {src.get('name')}: {raw!r}") from e
    if n < 1:
        raise ValueError(f"pages debe ser ≥ 1 ({src.get('name')}: {n})")
    if n > cap:
        raise ValueError(
            f"pages={n} supera el máximo de robots.txt para {site} ({cap})"
        )
    return n


def page_url(site: str, url: str, n: int) -> str:
    """Paginación permitida por robots.txt. Argenprop no admite combinar query params."""
    if site == "argenprop":
        base = url.split("?", 1)[0]
        if n <= 1:
            return base
        return f"{base}?pagina-{n}"
    if site == "mercadolibre":
        # robots.txt Disallow: /*_Desde_  (es la paginación del listado)
        return url
    if n == 1:
        return url
    return url.replace(".html", f"-pagina-{n}.html", 1)


class Blocked(Exception):
    pass


def _log_fetch_failure(url: str, r: requests.Response) -> None:
    keys = (
        "server",
        "x-amzn-waf-action",
        "cf-ray",
        "location",
        "content-type",
    )
    hdrs = ", ".join(f"{k}={r.headers.get(k)}" for k in keys if r.headers.get(k))
    body = re.sub(r"\s+", " ", (r.text or "")[:300])
    print(
        f"[fetch] FAIL {r.status_code} {url}\n"
        f"  final={r.url}\n"
        f"  headers: {hdrs or '(sin headers relevantes)'}\n"
        f"  body: {body}",
        file=sys.stderr,
    )


def fetch(session: requests.Session, url: str, *, _retried: bool = False) -> tuple[str, str]:
    r = session.get(url, timeout=30)
    if r.url.split("?")[0].rstrip("/") != url.split("?")[0].rstrip("/"):
        print(f"[fetch] redirect {url} → {r.url}", file=sys.stderr)
    waf = (r.headers.get("x-amzn-waf-action") or "").lower()
    if r.status_code == 202 or waf in ("challenge", "block"):
        _log_fetch_failure(url, r)
        raise Blocked(f"HTTP {r.status_code} (WAF {waf or 'challenge'})")
    # 403/429/503 de Zonaprop suelen ser intermitentes; 405/WAF de Argenprop, no.
    if r.status_code in (403, 429, 503) and not _retried:
        wait = random.uniform(20, 30)
        print(f"[fetch] {r.status_code} {url}; reintento en {wait:.0f}s", file=sys.stderr)
        time.sleep(wait)
        return fetch(session, url, _retried=True)
    if r.status_code in (403, 405, 429, 503):
        _log_fetch_failure(url, r)
        raise Blocked(f"HTTP {r.status_code} (posible bloqueo anti-bot)")
    if r.status_code == 404:
        _log_fetch_failure(url, r)
        raise Blocked("HTTP 404 (revisar el slug de la URL en config.json)")
    if r.status_code >= 400:
        _log_fetch_failure(url, r)
        r.raise_for_status()
    head = r.text[:4000].lower()
    if any(k in head for k in BLOCK_MARKERS) and "m²" not in r.text:
        _log_fetch_failure(url, r)
        raise Blocked("página de desafío anti-bot")
    return r.text, r.url


def scrape_source(session, src: dict, cfg: dict) -> tuple[list[dict], list[dict]]:
    """Devuelve (avisos, última página si se llegó al tope de páginas)."""
    site = src["site"]
    found: dict[str, dict] = {}
    last_page_items: list[dict] = []
    max_pages = source_pages(src, cfg)
    hit_cap = False
    for n in range(1, max_pages + 1):
        url = page_url(site, src["url"], n)
        html_text, final_url = fetch(session, url)
        if n == 1 and not page_matches_zone(html_text, final_url, src):
            raise Blocked(f"slug inválido: redirigió fuera de {src['name']} → {final_url}")
        items = [i for i in parse_page(html_text, site, url) if keep_listing(i, src, cfg.get("filters") or {})]
        new = [i for i in items if i["id"] not in found]
        if n == 1 and not items:
            raise Blocked("0 avisos de la zona en la página 1 (¿cambió el HTML o el slug?)")
        if not new:
            hit_cap = False
            last_page_items = []
            break
        for i in new:
            apply_zone(i, cfg.get("filters") or {}, src)
            apply_signals(i, cfg.get("signals") or [], cfg.get("filters") or {})
            found[i["id"]] = i
        last_page_items = new
        hit_cap = n == max_pages
        time.sleep(random.uniform(*cfg["delay_seconds"]))
    return list(found.values()), last_page_items if hit_cap else []


def iso_week(day: str) -> str:
    """Semana ISO (lunes) a partir de YYYY-MM-DD o ISO datetime."""
    raw = (day or "")[:10]
    dt = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
    return f"{dt.isocalendar().year}-W{dt.isocalendar().week:02d}"


def coverage_unseen(last_page_items: list[dict], seen_ids: set[str], filters: dict) -> list[dict]:
    """Avisos de la última página que pasan filtros y nunca vimos."""
    if not seen_ids:
        return []
    return [i for i in last_page_items if i["id"] not in seen_ids and matches(i, filters)]


def coverage_warning(label: str, last_page_items: list[dict], seen_ids: set[str], filters: dict, pages: int = 0) -> str | None:
    unseen = coverage_unseen(last_page_items, seen_ids, filters)
    if not unseen:
        return None
    _ = pages
    return (
        f"{label}: esta fuente puede tener avisos fuera de las páginas permitidas; "
        f"conviene partirla en más URLs"
    )


# ---------------------------------------------------------------- telegram --

def redact_secrets(msg: str, token: str = "") -> str:
    out = str(msg or "")
    tok = token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if tok:
        out = out.replace(tok, "[redacted]")
    return out


def site_footer() -> str:
    url = (os.environ.get("SITE_URL") or "").strip()
    if not url:
        return ""
    return f"\n🌐 {html.escape(url)}"


def _tg_retry_after(r: requests.Response) -> float:
    try:
        data = r.json()
        wait = (data.get("parameters") or {}).get("retry_after")
        if wait is not None:
            return max(1.0, float(wait))
    except (ValueError, TypeError):
        pass
    hdr = r.headers.get("Retry-After")
    if hdr:
        try:
            return max(1.0, float(hdr))
        except ValueError:
            pass
    return 5.0


def _tg_post(token: str, method: str, payload: dict) -> requests.Response:
    url = f"https://api.telegram.org/bot{token}/{method}"
    r = requests.post(url, json=payload, timeout=30)
    if r.status_code == 429:
        wait = _tg_retry_after(r)
        print(f"[telegram] 429; reintento en {wait:.0f}s", file=sys.stderr)
        time.sleep(wait)
        r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    return r


def top_ids(items: list[dict], n: int) -> set[str]:
    """Los N primeros del ranking (score, después precio)."""
    if n <= 0:
        return set()
    return {i["id"] for i in prefer(items)[:n] if i.get("id")}


def is_loud(item: dict, cfg: dict) -> bool:
    if (item.get("score") or 0) >= cfg.get("notify_loud_min_score", 3):
        return True
    old, new = item.get("old_price"), item.get("price")
    pct = cfg.get("notify_loud_drop_pct", 5)
    if old and new and old > new and pct is not None:
        return ((old - new) * 100 / old) >= pct
    return False


def tg_send(token: str, chat_id: str, text: str, *, silent: bool = False) -> None:
    _tg_post(
        token,
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "disable_notification": bool(silent),
        },
    )


def tg_send_photo(token: str, chat_id: str, photo: str, caption: str, *, silent: bool = False) -> None:
    _tg_post(
        token,
        "sendPhoto",
        {
            "chat_id": chat_id,
            "photo": photo,
            "caption": caption[:1024],
            "parse_mode": "HTML",
            "disable_notification": bool(silent),
        },
    )


def last_drop(item: dict) -> dict | None:
    hist = [h for h in (item.get("price_history") or []) if isinstance(h, dict)]
    last = None
    count = 0
    for a, b in zip(hist, hist[1:]):
        pa, pb = a.get("price"), b.get("price")
        if pa is None or pb is None or pb >= pa:
            continue
        count += 1
        last = {"from": int(pa), "to": int(pb), "at": b.get("date") or None}
    old, current = item.get("old_price"), item.get("price")
    if last is None and old is not None and current is not None and old > current:
        at = hist[-1].get("date") if hist else None
        last = {"from": int(old), "to": int(current), "at": at}
        count = max(count, 1)
    if last is None:
        return None
    delta = last["from"] - last["to"]
    pct = int(round(delta * 100 / last["from"])) if last["from"] else 0
    return {**last, "delta": delta, "pct": pct, "count": count}


def prior_price(item: dict) -> int | None:
    d = last_drop(item)
    return d["from"] if d else None


def drop_when(iso: str | None, now: datetime | None = None) -> str:
    if not iso:
        return "en una corrida anterior"
    try:
        t = datetime.fromisoformat(iso[:19]).date()
    except ValueError:
        return "en una corrida anterior"
    today = (now or datetime.now(timezone.utc)).date()
    days = (today - t).days
    if days <= 0:
        return "hoy"
    if days == 1:
        return "ayer"
    if days < 7:
        return f"hace {days} días"
    return f"el {t.day} {('ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic')[t.month - 1]} {t.year}"


def format_drop(item: dict, *, short: bool = False) -> str:
    d = last_drop(item)
    if not d:
        return ""
    when = drop_when(d.get("at"))
    src = f"USD {_fmt_int(d['from'])}"
    dst = f"USD {_fmt_int(d['to'])}"
    cut = f"−USD {_fmt_int(d['delta'])} · {d['pct']}%"
    if short:
        return f"bajó {when} de {src} a {dst} (−{d['pct']}%)"
    times = f" {d['count']} bajas nuestras en total." if d["count"] > 1 else ""
    if not d.get("at"):
        return (
            f"Bajó de {src} a {dst} ({cut}) en una corrida anterior. "
            f"Lo vimos nosotros; el portal no dice cuándo.{times}"
        )
    lead = when[:1].upper() + when[1:]
    return (
        f"{lead} bajó de {src} a {dst} ({cut}). "
        f"Lo vimos nosotros; el portal no dice cuándo.{times}"
    )


def why_line(i: dict, cfg: dict | None = None) -> str:
    raw = i.get("verdict")
    text = raw.get("text") if isinstance(raw, dict) else None
    if not text:
        text = verdict(i, cfg)["text"]
    return html.escape(text)


def _fmt_int(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def extras_line(i: dict) -> str:
    bits = []
    if i.get("expensas_ars") is not None:
        bits.append(f"expensas $ {_fmt_int(i['expensas_ars'])}")
    else:
        bits.append("expensas s/d")
    if i.get("piso") is not None:
        bits.append("PB" if i["piso"] == 0 else f"piso {i['piso']}")
    if i.get("antiguedad_years") is not None:
        bits.append("a estrenar" if i["antiguedad_years"] == 0 else f"{i['antiguedad_years']} años")
    if i.get("cochera") is True:
        bits.append("cochera")
    elif i.get("cochera") is False:
        bits.append("sin cochera")
    return " · ".join(bits)


def decision_lines(i: dict) -> list[str]:
    lines = []
    u = i.get("usd_per_m2")
    if u is not None:
        bit = f"USD {_fmt_int(u)}/m²"
        pct = i.get("vs_median_pct")
        n = i.get("vs_median_n")
        zone = i.get("zone") or ""
        if pct is not None and n:
            sign = f"+{pct}" if pct > 0 else str(pct)
            bit += f" · {sign}% vs mediana de {zone} (n={n})"
        lines.append(bit)
    days = i.get("days_seen")
    drops = i.get("price_drops") or 0
    if days is not None:
        when = "hoy" if days == 0 else ("1 día" if days == 1 else f"{days} días")
        drop_txt = "sin bajas de precio" if drops == 0 else (
            "1 baja de precio" if drops == 1 else f"{drops} bajas de precio"
        )
        lines.append(f"visto hace {when} · {drop_txt}")
    ref = i.get("closing_ref_usd")
    if ref is not None:
        lines.append(f"Referencia de cierre ≈ USD {_fmt_int(ref)} (no es tasación; promedio CABA)")
    air = i.get("air_usd")
    if air is not None:
        exit_m2 = i.get("exit_usd_m2")
        reno = i.get("reno_usd_m2")
        bit = f"aire ≈ USD {_fmt_int(int(air))}"
        if exit_m2 and reno:
            bit += f" (salida USD {_fmt_int(int(exit_m2))}/m² − obra USD {_fmt_int(int(reno))}/m²)"
        lines.append(bit)
    return lines


def fmt_item(i: dict, tag: str = "🆕") -> str:
    area = f"{i['area']:g} m²" if i["area"] is not None else "m² s/d"
    amb = f"{i['ambientes']} amb" if i["ambientes"] is not None else "amb s/d"
    site = SITE_LABELS.get(i["site"], i["site"])
    where = html.escape(i.get("address") or i["title"])
    marks = ""
    if i.get("_pick"):
        marks += " · candidato"
    if i.get("_top"):
        n = i.get("_top_n") or 10
        marks += f" · top {n}"
    price = f"USD {i['price']:,}".replace(",", ".")
    drop_txt = format_drop(i)
    drop_line = f"\n{html.escape(drop_txt)}" if drop_txt else ""
    extras = extras_line(i)
    extra_lines = "".join(f"\n{html.escape(x)}" for x in ([extras] if extras else []) + decision_lines(i))
    return (
        f"{tag} <b>{price}</b>{marks} · {area} · {amb}{drop_line}\n"
        f"📍 {html.escape(i['zone'])} — {where}"
        f"{extra_lines}\n"
        f"{why_line(i)}\n"
        f"🔗 {site}: {html.escape(i['url'])}"
        f"{site_footer()}"
    )


def notify_payloads(intro: str, items: list[dict], errors_block: str, *, intro_silent: bool = False) -> list[dict]:
    """Un payload por pieza: intro/errores son texto; cada aviso puede llevar foto."""
    out: list[dict] = []
    if intro:
        out.append({"text": intro + site_footer(), "kind": "intro", "silent": bool(intro_silent)})
    for i in items:
        out.append(
            {
                "text": fmt_item(i, i.get("_tag") or "🆕"),
                "photo": i.get("photo") or "",
                "item_id": i.get("id"),
                "kind": "item",
                "silent": bool(i.get("_silent")),
            }
        )
    if errors_block:
        out.append({"text": errors_block + site_footer(), "kind": "error", "silent": False})
    return out


def deliver(token: str, chat_id: str, payloads: list[dict]) -> dict:
    """Envía cada mensaje por separado. Si uno falla, sigue con el resto."""
    sent_ids: list[str] = []
    failed_ids: list[str] = []
    intro_ok = True
    error_ok = True
    for p in payloads:
        kind = p.get("kind") or "text"
        item_id = p.get("item_id")
        photo = p.get("photo") or ""
        silent = bool(p.get("silent"))
        ok = False
        try:
            if photo:
                try:
                    tg_send_photo(token, chat_id, photo, p["text"], silent=silent)
                    ok = True
                except requests.RequestException as e:
                    print(
                        f"[telegram] foto falló ({redact_secrets(e, token)}); mando texto",
                        file=sys.stderr,
                    )
                    tg_send(token, chat_id, p["text"], silent=silent)
                    ok = True
            else:
                tg_send(token, chat_id, p["text"], silent=silent)
                ok = True
        except Exception as e:
            print(f"[telegram] {redact_secrets(e, token)}", file=sys.stderr)
            ok = False
        if kind == "item" and item_id:
            (sent_ids if ok else failed_ids).append(item_id)
        elif kind == "intro":
            intro_ok = ok
        elif kind == "error":
            error_ok = ok
        time.sleep(1)
    return {
        "sent_ids": sent_ids,
        "failed_ids": failed_ids,
        "intro_ok": intro_ok,
        "error_ok": error_ok,
    }


def chunk_messages(blocks: list[str], limit: int = 3800) -> list[str]:
    msgs, cur = [], ""
    for b in blocks:
        if cur and len(cur) + len(b) + 2 > limit:
            msgs.append(cur)
            cur = ""
        cur += ("\n\n" if cur else "") + b
    if cur:
        msgs.append(cur)
    return msgs


# --------------------------------------------------------- state / listings --

SITES = ("zonaprop", "argenprop", "mercadolibre")


def seen_path(site: str) -> Path:
    return STATE_DIR / f"seen-{site}.json"


def listings_path(site: str) -> Path:
    return WEB_DATA_DIR / f"listings-{site}.json"


def pick_path() -> Path:
    return WEB_DATA_DIR / "pick.json"


def empty_state() -> dict:
    return {"listings": {}, "meta": {}}


def empty_catalog() -> dict:
    return {"last_change": None, "listings": []}


def _read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text())


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


def _catalog_map(catalog: dict) -> dict[str, dict]:
    return {x["id"]: x for x in catalog.get("listings") or [] if x.get("id")}


def migrate_legacy_seen() -> None:
    """seen.json era todo Zonaprop. Se copia una vez, sin reavisar."""
    if seen_path("zonaprop").exists() or not OLD_SEEN_PATH.exists():
        return
    old = _read_json(OLD_SEEN_PATH, empty_state())
    listings = old.get("listings") or {}
    if not listings:
        write_json(seen_path("zonaprop"), empty_state())
        write_json(seen_path("argenprop"), empty_state())
        return
    zp, ap = empty_state(), empty_state()
    zp["meta"] = {k: v for k, v in (old.get("meta") or {}).items() if k == "last_error_day"}
    catalog: list[dict] = []
    for lid, rec in listings.items():
        site = "argenprop" if str(lid).startswith("argenprop:") else "zonaprop"
        dest = ap if site == "argenprop" else zp
        dest["listings"][lid] = {
            "price": rec.get("price"),
            "url": rec.get("url"),
            "first_seen": rec.get("first_seen"),
            "key": rec.get("key"),
            "zone": infer_zone(rec.get("url") or "", rec.get("zone") or ""),
        }
        if site == "zonaprop":
            catalog.append(listing_from_seen(lid, rec, site))
    write_json(seen_path("zonaprop"), zp)
    write_json(seen_path("argenprop"), ap)
    if catalog and not listings_path("zonaprop").exists():
        write_json(listings_path("zonaprop"), {"last_change": None, "listings": catalog})
    if not listings_path("argenprop").exists():
        write_json(listings_path("argenprop"), empty_catalog())
    print(f"[state] migrado seen.json → state/ ({len(zp['listings'])} zonaprop, {len(ap['listings'])} argenprop)", file=sys.stderr)


def infer_zone(url: str, explicit: str = "") -> str:
    if explicit:
        return explicit
    u = fold(url or "")
    mapping = (
        ("Palermo Chico", ("palermo-chico", "palermo chico")),
        ("Barrio Norte", ("barrio-norte", "barrio norte")),
        ("Botánico", ("botanico", "botánico")),
        ("Recoleta", ("recoleta",)),
    )
    for name, keys in mapping:
        if any(k in u for k in keys):
            return name
    return ""


def title_from_url(url: str) -> str:
    slug = (url or "").rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"\.html?$", "", slug, flags=re.I)
    slug = re.sub(r"-?\d{6,}$", "", slug)
    parts = [p for p in slug.split("-") if p and p not in ("veclapin", "veclap", "clasificado") and not p.isdigit()]
    title = " ".join(parts).strip()
    return title[:90]


def listing_from_seen(lid: str, rec: dict, site: str) -> dict:
    first = rec.get("first_seen")
    price = rec.get("price")
    hist = [{"date": first, "price": price}] if first and price is not None else []
    url = rec.get("url") or ""
    return {
        "id": lid,
        "site": site,
        "url": url,
        "title": rec.get("title") or title_from_url(url),
        "address": rec.get("address") or "",
        "zone": infer_zone(url, rec.get("zone") or ""),
        "price": price,
        "old_price": None,
        "price_history": hist,
        "area": None,
        "ambientes": None,
        "photo": "",
        "tags": [],
        "score": 0,
        "first_seen": first,
        "active": True,
        "gone_at": None,
    }


def load_portal(site: str, *, persist: bool = True) -> tuple[dict, dict]:
    if persist:
        migrate_legacy_seen()
    state = _read_json(seen_path(site), empty_state())
    state.setdefault("listings", {})
    state.setdefault("meta", {})
    catalog = _read_json(listings_path(site), empty_catalog())
    catalog.setdefault("listings", [])
    return state, catalog


def dump_equal(a, b) -> bool:
    return json.dumps(a, sort_keys=True, ensure_ascii=False) == json.dumps(b, sort_keys=True, ensure_ascii=False)


def save_portal(site: str, state: dict, catalog: dict, prev_state: dict, prev_catalog: dict) -> bool:
    """Escribe solo si hubo un cambio real (aviso, precio o baja)."""
    changed = not dump_equal(state, prev_state) or not dump_equal(catalog, prev_catalog)
    if not changed:
        return False
    write_json(seen_path(site), state)
    write_json(listings_path(site), catalog)
    return True


def upsert_listing(prev: dict | None, item: dict, now: str, *, active: bool = True, gone_at: str | None = None) -> dict:
    prev = prev or {}
    price = item.get("price", prev.get("price"))
    hist = list(prev.get("price_history") or [])
    if price is not None and (not hist or hist[-1].get("price") != price):
        hist.append({"date": now, "price": price})
    old_price = item.get("old_price")
    if old_price is None:
        old_price = prev.get("old_price")
    first = prev.get("first_seen") or item.get("first_seen") or now
    return {
        "id": item.get("id") or prev.get("id"),
        "site": item.get("site") or prev.get("site"),
        "url": item.get("url") or prev.get("url") or "",
        "title": item.get("title") or prev.get("title") or "",
        "address": item.get("address") or prev.get("address") or "",
        "zone": item.get("zone") or prev.get("zone") or "",
        "price": price,
        "old_price": old_price,
        "price_history": hist,
        "area": item.get("area") if item.get("area") is not None else prev.get("area"),
        "area_total": item.get("area_total") if item.get("area_total") is not None else prev.get("area_total"),
        "area_covered": item.get("area_covered") if item.get("area_covered") is not None else prev.get("area_covered"),
        "area_semi": item.get("area_semi") if item.get("area_semi") is not None else prev.get("area_semi"),
        "ambientes": item.get("ambientes") if item.get("ambientes") is not None else prev.get("ambientes"),
        "photo": item.get("photo") or prev.get("photo") or "",
        "tags": item.get("tags") if item.get("tags") is not None else (prev.get("tags") or []),
        "score": item.get("score", prev.get("score") or 0),
        "first_seen": first,
        "active": active,
        "gone_at": gone_at if not active else None,
        "usd_per_m2": item.get("usd_per_m2") if item.get("usd_per_m2") is not None else prev.get("usd_per_m2"),
        "vs_median_pct": item.get("vs_median_pct") if item.get("vs_median_pct") is not None else prev.get("vs_median_pct"),
        "vs_median_n": item.get("vs_median_n") if item.get("vs_median_n") is not None else prev.get("vs_median_n"),
        "days_seen": item.get("days_seen") if item.get("days_seen") is not None else prev.get("days_seen"),
        "price_drops": item.get("price_drops") if item.get("price_drops") is not None else prev.get("price_drops"),
        "closing_ref_usd": item.get("closing_ref_usd") if item.get("closing_ref_usd") is not None else prev.get("closing_ref_usd"),
        "expensas_ars": item["expensas_ars"] if "expensas_ars" in item else prev.get("expensas_ars"),
        "expensas_text": item["expensas_text"] if "expensas_text" in item else (prev.get("expensas_text") or ""),
        "price_source": item.get("price_source") or prev.get("price_source") or "card",
        "address_unverified": item.get("address_unverified", prev.get("address_unverified")),
        "zone_unverified": item.get("zone_unverified", prev.get("zone_unverified")),
        "neto_hard_usd": item.get("neto_hard_usd") if item.get("neto_hard_usd") is not None else prev.get("neto_hard_usd"),
        "neto_base_usd": item.get("neto_base_usd") if item.get("neto_base_usd") is not None else prev.get("neto_base_usd"),
        "roi_hard": item.get("roi_hard") if item.get("roi_hard") is not None else prev.get("roi_hard"),
        "roi_base": item.get("roi_base") if item.get("roi_base") is not None else prev.get("roi_base"),
        "breakeven_exit_usd_m2": item.get("breakeven_exit_usd_m2") if item.get("breakeven_exit_usd_m2") is not None else prev.get("breakeven_exit_usd_m2"),
        "max_offer_usd": item.get("max_offer_usd") if item.get("max_offer_usd") is not None else prev.get("max_offer_usd"),
        "seventy_offer_usd": item.get("seventy_offer_usd") if item.get("seventy_offer_usd") is not None else prev.get("seventy_offer_usd"),
        "decision": item.get("decision") if item.get("decision") is not None else prev.get("decision"),
        "antiguedad_years": item.get("antiguedad_years") if item.get("antiguedad_years") is not None else prev.get("antiguedad_years"),
        "piso": item.get("piso") if item.get("piso") is not None else prev.get("piso"),
        "cochera": item.get("cochera") if item.get("cochera") is not None else prev.get("cochera"),
        "air_usd": item.get("air_usd") if item.get("air_usd") is not None else prev.get("air_usd"),
        "exit_usd_m2": item.get("exit_usd_m2") if item.get("exit_usd_m2") is not None else prev.get("exit_usd_m2"),
        "reno_usd_m2": item.get("reno_usd_m2") if item.get("reno_usd_m2") is not None else prev.get("reno_usd_m2"),
    }


def seen_rec(item: dict, prev: dict | None, now: str) -> dict:
    prev = prev or {}
    rec = {
        "price": item["price"],
        "url": item["url"],
        "first_seen": prev.get("first_seen") or now,
        "zone": item.get("zone") or prev.get("zone"),
    }
    k = listing_key(item)
    if k:
        rec["key"] = k
    pk = place_key(item)
    if pk:
        rec["place"] = pk
    return rec


def mark_gone(
    catalog: dict,
    ok_zones: set[str],
    live_ids: set[str],
    now: str,
    *,
    all_zones: set[str] | None = None,
) -> list[str]:
    """Marca dados de baja solo si su zona se scrapeó OK.

    Sin zona conocida, solo si se scrapeó OK el portal entero (todas las zonas).
    """
    full_ok = bool(all_zones) and all_zones <= ok_zones
    gone: list[str] = []
    out = []
    for rec in catalog.get("listings") or []:
        lid = rec.get("id")
        zone = rec.get("zone") or ""
        source_ok = zone in ok_zones or (not zone and full_ok)
        if rec.get("active") and source_ok and lid not in live_ids:
            rec = {**rec, "active": False, "gone_at": now}
            gone.append(lid)
        out.append(rec)
    catalog["listings"] = out
    return gone


def drop_out_of_scope(catalog: dict, f: dict, now: str) -> list[str]:
    """Apaga fichas viejas fuera de CABA / sin barrio (migración, SEO de otro lado)."""
    gone: list[str] = []
    out = []
    for rec in catalog.get("listings") or []:
        probe = {**rec}
        ok = apply_zone(probe, f)
        if rec.get("active") is not False and not ok:
            rec = {**rec, "active": False, "gone_at": rec.get("gone_at") or now}
            if rec.get("id"):
                gone.append(rec["id"])
        out.append(rec)
    catalog["listings"] = out
    return gone


def apply_live_to_catalog(catalog: dict, items: list[dict], now: str) -> None:
    by_id = _catalog_map(catalog)
    for i in items:
        by_id[i["id"]] = upsert_listing(by_id.get(i["id"]), i, now, active=True)
    catalog["listings"] = sorted(by_id.values(), key=lambda x: x.get("id") or "")


_ENRICH_KEYS = (
    "photo",
    "address",
    "area",
    "ambientes",
    "expensas_ars",
    "expensas_text",
    "antiguedad_years",
    "piso",
    "cochera",
    "title",
    "zone",
)


def enrich_catalog(catalog: dict, items: list[dict], now: str | None = None) -> int:
    """Completa foto, ficha y precio de avisos ya vistos. No crea altas. Devuelve cuántos cambió."""
    by_id = _catalog_map(catalog)
    changed = 0
    stamp = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    for i in items:
        prev = by_id.get(i.get("id") or "")
        if not prev:
            continue
        patch: dict = {}
        for key in _ENRICH_KEYS:
            new, old = i.get(key), prev.get(key)
            if new in (None, "", []) or new == old:
                continue
            patch[key] = new
        tags = i.get("tags")
        if tags and tags != (prev.get("tags") or []):
            patch["tags"] = tags
        if i.get("score", 0) != (prev.get("score") or 0):
            patch["score"] = i.get("score", 0)
        for key in (
            "air_usd",
            "exit_usd_m2",
            "reno_usd_m2",
            "area_total",
            "area_covered",
            "area_semi",
            "neto_hard_usd",
            "neto_base_usd",
            "max_offer_usd",
            "seventy_offer_usd",
            "decision",
        ):
            new, old = i.get(key), prev.get(key)
            if new is not None and new != old:
                patch[key] = new
        live = i.get("price")
        old = prev.get("price")
        if live is not None and live != old:
            patch["price"] = live
            hist = list(prev.get("price_history") or [])
            if not hist or hist[-1].get("price") != live:
                hist.append({"date": stamp, "price": live})
            patch["price_history"] = hist
            if old is not None and live < old:
                patch["old_price"] = old
        if not patch:
            continue
        by_id[prev["id"]] = {**prev, **patch}
        changed += 1
    if changed:
        catalog["listings"] = sorted(by_id.values(), key=lambda x: x.get("id") or "")
    return changed


def classify_changes(matched: list[dict], state: dict) -> tuple[list[dict], list[dict]]:
    new_items, drops = [], []
    for i in matched:
        prev = find_prev(i, state)
        if prev is None:
            new_items.append(i)
        elif i["price"] is not None and prev.get("price") is not None and i["price"] < prev["price"]:
            drops.append({**i, "old_price": prev["price"]})
    return prefer(new_items), prefer(drops)


def week_start(day: str):
    dt = datetime.fromisoformat(day[:10]).date()
    return dt - timedelta(days=dt.weekday())


def in_iso_week(iso: str | None, day: str) -> bool:
    if not iso:
        return False
    try:
        d = datetime.fromisoformat(iso[:10]).date()
    except ValueError:
        return False
    start = week_start(day)
    return start <= d < start + timedelta(days=7)


def dropped_this_week(item: dict, day: str) -> int:
    hist = item.get("price_history") or []
    delta = 0
    for a, b in zip(hist, hist[1:]):
        pa, pb = a.get("price"), b.get("price")
        if pa is None or pb is None or pb >= pa:
            continue
        if in_iso_week(b.get("date"), day):
            delta += pa - pb
    return delta


def build_weekly_snapshot(listings: list[dict], now: str, today: str) -> dict:
    zones: dict[str, list[dict]] = {}
    for i in listings:
        if not i.get("id"):
            continue
        zones.setdefault(i.get("zone") or "s/d", []).append(i)
    out_zones = {}
    for zone, rows in zones.items():
        active = [x for x in rows if x.get("active") is not False]
        usd = [listing_usd_m2(x) for x in active if listing_usd_m2(x) is not None]
        med = median([u for u in usd if u is not None])
        out_zones[zone] = {
            "active": len(active),
            "new": sum(1 for x in active if in_iso_week(x.get("first_seen"), today)),
            "drops": sum(1 for x in rows if dropped_this_week(x, today) > 0),
            "median_usd_m2": int(round(med)) if med is not None else None,
            "n": len(usd),
        }
    ranked = []
    for i in listings:
        delta = dropped_this_week(i, today)
        if delta > 0:
            ranked.append({
                "id": i.get("id"),
                "zone": i.get("zone") or "",
                "title": i.get("title") or i.get("address") or i.get("id"),
                "price": i.get("price"),
                "delta": delta,
            })
    ranked.sort(key=lambda x: -x["delta"])
    return {
        "week": iso_week(today),
        "saved_at": now,
        "zones": out_zones,
        "top_drops": ranked[:3],
    }


def format_weekly(snap: dict, prev: dict | None) -> str:
    prev_zones = (prev or {}).get("zones") or {}
    lines = [f"📊 Resumen semanal {snap.get('week')}"]
    for zone in sorted(snap.get("zones") or {}):
        z = snap["zones"][zone]
        med = z.get("median_usd_m2")
        med_txt = f"USD {_fmt_int(med)}/m²" if med is not None else "mediana s/d"
        prev_med = (prev_zones.get(zone) or {}).get("median_usd_m2")
        if med is not None and prev_med:
            pct = int(round((med - prev_med) * 100 / prev_med))
            sign = f"+{pct}" if pct > 0 else str(pct)
            med_txt += f" ({sign}% vs sem. anterior)"
        lines.append(
            f"• {zone}: {z.get('active', 0)} activos · {z.get('new', 0)} nuevos · "
            f"{z.get('drops', 0)} bajas · {med_txt}"
        )
    tops = snap.get("top_drops") or []
    if tops:
        lines.append("Más bajaron:")
        for t in tops:
            lines.append(
                f"• {html.escape(str(t.get('title') or t.get('id')))} "
                f"(−USD {_fmt_int(int(t.get('delta') or 0))})"
            )
    else:
        lines.append("Sin bajas de precio esta semana.")
    return "\n".join(lines)


def is_weekly_slot(today: str, hour: int | None = None) -> bool:
    dt = datetime.fromisoformat(today[:10])
    if dt.weekday() != 0:
        return False
    return hour is None or hour == 11


def maybe_weekly_summary(cfg: dict, *, dry_run: bool, token: str, chat_id: str, now: str, today: str, persist: bool) -> None:
    hour = datetime.now(timezone.utc).hour
    if not is_weekly_slot(today, hour):
        return
    prev = _read_json(WEEKLY_PATH, {})
    if prev.get("week") == iso_week(today):
        return
    listings = []
    for site in SITES:
        listings.extend(load_portal(site, persist=False)[1].get("listings") or [])
    snap = build_weekly_snapshot(listings, now, today)
    text = format_weekly(snap, prev if prev.get("week") else None)
    payloads = [{"text": text + site_footer(), "kind": "intro", "silent": True}]
    if dry_run:
        print("-----\n" + payloads[0]["text"])
        return
    if token and chat_id:
        deliver(token, chat_id, payloads)
    if persist:
        write_json(WEEKLY_PATH, snap)


def should_send_coverage(state: dict, today: str) -> bool:
    last = (state.get("meta") or {}).get("coverage_week")
    return last != iso_week(today)


def process_portal(
    site: str,
    matched: list[dict],
    ok_zones: set[str],
    errors: list[str],
    cfg: dict,
    *,
    dry_run: bool,
    token: str,
    chat_id: str,
    now: str,
    today: str,
    coverage_notes: list[str] | None = None,
) -> bool:
    """Actualiza un portal. Devuelve True si hubo fuentes OK de ese portal."""
    if not ok_zones:
        if errors:
            err_block = "⚠️ Problemas en esta corrida:\n" + "\n".join(f"• {html.escape(e)}" for e in errors)
            payloads = notify_payloads("", [], err_block)
            if dry_run:
                for p in payloads:
                    print("-----\n" + p["text"])
            elif token and chat_id:
                deliver(token, chat_id, payloads)
        return False

    state, catalog = load_portal(site, persist=not dry_run)
    prev_state = json.loads(json.dumps(state))
    prev_catalog = json.loads(json.dumps(catalog))
    first_run = not state["listings"]

    by_cat = _catalog_map(catalog)
    for i in matched:
        prev = by_cat.get(i["id"]) or state["listings"].get(i["id"]) or {}
        i["first_seen"] = prev.get("first_seen") or now
        i["price_history"] = list(prev.get("price_history") or [])
    extra = list(catalog.get("listings") or [])
    for other in SITES:
        if other != site:
            extra.extend(load_portal(other, persist=False)[1].get("listings") or [])
    attach_decisions(matched, extra, cfg, now)
    matched[:] = [i for i in matched if keep_flip(i)]

    new_items, drops = classify_changes(matched, state)
    silent_dupes: list[dict] = []
    if not first_run:
        known = places_from_other_portals(site)
        kept: list[dict] = []
        for i in new_items:
            pk = place_key(i)
            if pk and pk in known:
                silent_dupes.append(i)
            else:
                kept.append(i)
        new_items = kept
    for d in drops:
        apply_decision(d, zone_medians(pool_for_median(matched, extra), cfg.get("median_min_n", 8)), cfg, now)
        apply_value(d, cfg)
        apply_air(d, cfg)
    for i in matched + drops:
        i["verdict"] = verdict(i, cfg)
    pick_id = resolve_pick_id(matched + extra)
    print(
        f"[{site}] filtros: {len(matched)} · nuevos: {len(new_items)} · "
        f"bajas de precio: {len(drops)} · primera={first_run}"
    )

    intro = ""
    show: list[dict] = []
    if first_run:
        intro = (
            f"✅ Buscador activo ({site}). Cargué {len(matched)} avisos para flip "
            f"(buen edificio, unidad a reciclar, aire vs la salida del barrio). "
            f"Gusto 125k, techo 140k. De ahora en más, solo nuevos."
        )
        show = [{**i, "_tag": "📌", "_silent": not is_loud(i, cfg)} for i in prefer(matched)[:10]]
    else:
        top_n = int(cfg.get("alert_top_n") or 0)
        tops = top_ids(matched, top_n)
        show = [{**i, "_tag": "🆕", "_silent": not is_loud(i, cfg)} for i in new_items]
        for i in drops:
            top = i["id"] in tops
            pick = i["id"] == pick_id
            show.append({
                **i,
                "_tag": "📉",
                "_top": top,
                "_top_n": top_n,
                "_pick": pick,
                "_silent": False if (top or pick) else not is_loud(i, cfg),
            })
    for i in show:
        if i.get("id") == pick_id:
            i["_pick"] = True
            if i.get("_tag") == "📉":
                i["_silent"] = False

    notify_error = bool(errors) and state["meta"].get("last_error_day") != today
    err_block = ""
    if notify_error:
        err_block = "⚠️ Problemas en esta corrida:\n" + "\n".join(f"• {html.escape(e)}" for e in errors)
    notes = [n for n in (coverage_notes or []) if n]
    notify_coverage = bool(notes) and should_send_coverage(state, today)
    if notify_coverage:
        extra = "⚠️ Cobertura:\n" + "\n".join(f"• {html.escape(n)}" for n in notes)
        err_block = (err_block + "\n\n" if err_block else "") + extra

    heartbeat = False
    if (
        cfg.get("heartbeat")
        and not first_run
        and not new_items
        and not drops
        and datetime.now(timezone.utc).hour == 11
    ):
        heartbeat = True
        if not intro:
            intro = f"⏱ Corrí ({site}), sin novedades. {len(matched)} avisos activos."

    payloads = notify_payloads(intro, show, err_block, intro_silent=heartbeat)
    sent_ids: set[str] = set()
    intro_ok = True
    error_ok = True

    if dry_run:
        for p in payloads:
            extra = f"\n🖼 {p['photo']}" if p.get("photo") else ""
            print("-----\n" + p["text"] + extra)
        return True

    if payloads:
        result = deliver(token, chat_id, payloads)
        sent_ids = set(result["sent_ids"])
        intro_ok = result["intro_ok"]
        error_ok = result["error_ok"]
        if result["failed_ids"]:
            print(f"[telegram] no enviados ({site}): {len(result['failed_ids'])}", file=sys.stderr)

    # Primera corrida: marcar todos si el resumen salió. Si no, no tocar.
    # Corridas siguientes: solo lo que Telegram confirmó (nuevo o baja de precio).
    mark_ids: set[str]
    if first_run:
        mark_ids = {i["id"] for i in matched} if intro_ok else set()
    else:
        mark_ids = sent_ids

    catalog_dirty = False
    if first_run and intro_ok and matched:
        apply_live_to_catalog(catalog, matched, now)
        catalog_dirty = True
    else:
        live_notify = [i for i in new_items + drops if i["id"] in mark_ids]
        if live_notify:
            apply_live_to_catalog(catalog, live_notify, now)
            catalog_dirty = True
        if enrich_catalog(catalog, matched, now):
            catalog_dirty = True
        if silent_dupes:
            apply_live_to_catalog(catalog, silent_dupes, now)
            catalog_dirty = True
            for i in silent_dupes:
                state["listings"][i["id"]] = seen_rec(i, state["listings"].get(i["id"]), now)

    configured = {source_zone(src) for src in cfg.get("sources") or [] if src.get("site") == site}
    gone_ids = mark_gone(catalog, ok_zones, {i["id"] for i in matched}, now, all_zones=configured)
    gone_ids.extend(drop_out_of_scope(catalog, cfg.get("filters") or {}, now))
    gone_ids = list(dict.fromkeys(gone_ids))
    if gone_ids:
        catalog_dirty = True
        print(f"[{site}] dados de baja: {len(gone_ids)}")

    for i in matched:
        if i["id"] not in mark_ids:
            continue
        state["listings"][i["id"]] = seen_rec(i, state["listings"].get(i["id"]), now)

    if notify_error and error_ok:
        state["meta"]["last_error_day"] = today
    elif not errors:
        state["meta"].pop("last_error_day", None)
    if notify_coverage and (dry_run or error_ok):
        state["meta"]["coverage_week"] = iso_week(today)

    if catalog_dirty:
        catalog["last_change"] = now

    real_change = bool(mark_ids or gone_ids or catalog_dirty or (notify_coverage and not dry_run))
    if real_change and not dry_run:
        save_portal(site, state, catalog, prev_state, prev_catalog)
    if not dry_run:
        pool = list(catalog.get("listings") or [])
        for other in SITES:
            if other != site:
                pool.extend(load_portal(other, persist=False)[1].get("listings") or [])
        by_id = {i["id"]: i for i in pool if i.get("id")}
        for i in matched:
            by_id[i["id"]] = {**by_id.get(i["id"], {}), **i, "active": True}
        save_pick(list(by_id.values()))
    elif notify_error and error_ok:
        # Error real avisado: no commitear seen solo por last_error_day.
        # Se reintenta el aviso al día siguiente si el error sigue; si se fue, no importa.
        pass

    _ = heartbeat
    return True


def enrich_from_portals(cfg: dict, *, only: str | None = None) -> int:
    """Relee listados permitidos y completa foto/ficha. Sin Telegram ni dados de baja."""
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9"})
    sources = [x for x in cfg["sources"] if not only or x["site"] == only]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    current: dict[str, dict[str, dict]] = {k: {} for k in SITES}
    errors = 0
    for src in sources:
        site = src["site"]
        label = f"{site} · {src['name']}"
        try:
            items, _ = scrape_source(session, src, cfg)
            print(f"[ok] {label}: {len(items)} avisos")
            for i in items:
                current[site][i["id"]] = i
        except (Blocked, requests.RequestException) as e:
            errors += 1
            print(f"[error] {label}: {e}", file=sys.stderr)
        time.sleep(random.uniform(*cfg["delay_seconds"]))

    updated = 0
    for site in SITES:
        if only and site != only:
            continue
        scraped = dedupe(list(current[site].values()))
        if not scraped:
            continue
        state, catalog = load_portal(site)
        n = enrich_catalog(catalog, scraped, now)
        known = {r.get("id") for r in catalog.get("listings") or []}
        fresh = [i for i in scraped if i["id"] not in known and matches(i, cfg["filters"])]
        if fresh:
            apply_live_to_catalog(catalog, fresh, now)
            n += len(fresh)
            for i in fresh:
                state["listings"][i["id"]] = seen_rec(i, state["listings"].get(i["id"]), now)
        if n:
            catalog["last_change"] = now
            write_json(listings_path(site), catalog)
            write_json(seen_path(site), state)
        photos = sum(1 for r in catalog.get("listings") or [] if r.get("photo"))
        print(f"[{site}] ficha: {n} avisos · {photos} con foto")
        updated += n
    return 1 if errors and not updated else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--enrich", action="store_true", help="Relee listados y completa fotos. Sin Telegram.")
    ap.add_argument("--only", choices=list(SITES))
    args = ap.parse_args()

    cfg = json.loads(CONFIG_PATH.read_text())
    for src in cfg.get("sources") or []:
        source_pages(src, cfg)
    if args.enrich:
        return enrich_from_portals(cfg, only=args.only)
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not args.dry_run and not (token and chat_id):
        print("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID", file=sys.stderr)
        return 2

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9"})

    in_actions = os.environ.get("GITHUB_ACTIONS", "").lower() == "true"
    sources = [x for x in cfg["sources"] if not args.only or x["site"] == args.only]

    errors_by_site: dict[str, list[str]] = {k: [] for k in SITES}
    ok_zones: dict[str, set[str]] = {k: set() for k in SITES}
    failed_zones: dict[str, set[str]] = {k: set() for k in SITES}
    current: dict[str, dict[str, dict]] = {k: {} for k in SITES}
    last_pages: dict[str, list[tuple[str, list[dict]]]] = {k: [] for k in SITES}
    attempted = 0
    skipped_argenprop = False

    for src in sources:
        site = src["site"]
        label = f"{site} · {src['name']}"
        if in_actions and site == "argenprop":
            skipped_argenprop = True
            print(f"[skip] {label}: bloqueado desde Actions (sin aviso Telegram)", file=sys.stderr)
            continue
        attempted += 1
        try:
            items, last_page = scrape_source(session, src, cfg)
            ok_zones[site].add(source_zone(src))
            print(f"[ok] {label}: {len(items)} avisos")
            last_pages[site].append((label, last_page))
            for i in items:
                current[site][i["id"]] = i
        except (Blocked, requests.RequestException) as e:
            failed_zones[site].add(source_zone(src))
            msg = redact_secrets(f"{label}: {e}", token)
            errors_by_site[site].append(msg)
            print(f"[error] {msg}", file=sys.stderr)
        time.sleep(random.uniform(*cfg["delay_seconds"]))

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    any_ok = False

    for site in SITES:
        if args.only and site != args.only:
            continue
        if in_actions and site == "argenprop":
            continue
        matched = dedupe([i for i in current[site].values() if matches(i, cfg["filters"])])
        state_preview, _ = load_portal(site, persist=not args.dry_run)
        seen_ids = set(state_preview.get("listings") or {})
        ok_zones[site] -= failed_zones[site]
        coverage_notes = []
        for label, last_page in last_pages[site]:
            warn = coverage_warning(label, last_page, seen_ids, cfg["filters"])
            if warn:
                print(f"[warn] {warn}", file=sys.stderr)
                coverage_notes.append(warn)
        if process_portal(
            site,
            matched,
            ok_zones[site],
            errors_by_site[site],
            cfg,
            dry_run=args.dry_run,
            token=token,
            chat_id=chat_id,
            now=now,
            today=today,
            coverage_notes=coverage_notes,
        ):
            any_ok = True

    maybe_weekly_summary(
        cfg,
        dry_run=args.dry_run,
        token=token,
        chat_id=chat_id,
        now=now,
        today=today,
        persist=not args.dry_run,
    )

    if skipped_argenprop:
        print("[skip] Argenprop no corre en Actions; no se toca su estado", file=sys.stderr)

    if any_ok:
        return 0
    if skipped_argenprop and not args.only and not attempted:
        return 0
    if skipped_argenprop and args.only == "zonaprop":
        return 0
    if skipped_argenprop and not any(errors_by_site[s] for s in SITES):
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
