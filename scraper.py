#!/usr/bin/env python3
"""Buscador de departamentos en venta (Argenprop + Zonaprop) con aviso por Telegram.

Uso:
    python scraper.py                    # corrida normal (usa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)
    python scraper.py --dry-run          # no manda Telegram ni guarda estado, imprime en consola
    python scraper.py --only argenprop   # solo Argenprop (para cron/launchd en la Mac)
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
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.json"
OLD_SEEN_PATH = ROOT / "seen.json"
STATE_DIR = ROOT / "state"
WEB_DATA_DIR = ROOT / "web" / "data"

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
    for m in re.finditer(r"(desde\s+)?USD\s*(\d{1,3}(?:\.\d{3})+|\d{4,})", text, re.I):
        if m.group(1):
            continue
        try:
            return to_price(m.group(2))
        except ValueError:
            continue
    return None


def parse_card(site: str, text: str) -> dict:
    out = {"price": None, "area": None, "ambientes": None, "address": ""}
    out["price"] = parse_price(text)

    if site == "argenprop":
        cub = re.search(r"([\d.,]+)\s*m²\s*cubie", text)
        semi = re.search(r"([\d.,]+)\s*m²\s*Semicubierta", text, re.I)
        if cub:
            out["area"] = to_float(cub.group(1)) + (to_float(semi.group(1)) if semi else 0)
        m = re.search(r"de\s+(\d+)\s+ambientes", text) or re.search(r"(\d+)\s*(?:ambientes|amb\.)", text, re.I)
    else:
        tot = re.search(r"([\d.,]+)\s*m²\s*tot", text)
        if tot:
            out["area"] = to_float(tot.group(1))
        m = re.search(r"(\d+)\s*amb\.", text) or re.search(r"(\d+)\s*ambientes", text, re.I)
    if m:
        out["ambientes"] = int(m.group(1))
    elif re.search(r"monoambiente", text, re.I):
        out["ambientes"] = 1

    if site == "argenprop":
        m = re.search(r"dormitorios?\s+(.+?)\s+USD", text.replace("\n", " "))
        if m and len(m.group(1)) < 120:
            out["address"] = m.group(1).strip()
    else:
        m = re.search(
            r"\n([^\n]{3,80})\n[^\n]*(?:Capital Federal|CABA|Botánico|Botanico|Recoleta|Barrio Norte|Palermo Chico|Palermo)\b",
            text,
        )
        if m and len(m.group(1)) < 120:
            out["address"] = m.group(1).strip()
    return out


def card_photo(card, base_url: str) -> str:
    """Primera foto usable de la card. Vacío si no hay (logo / placeholder no cuenta)."""
    parts = base_url.split("/", 3)
    host = f"{parts[0]}//{parts[2]}" if len(parts) > 2 else ""
    skip = ("logo", "icon", "sprite", "placeholder", "1x1", "pixel")
    candidates: list[str] = []
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
        data = parse_card(site, sep_text if site == "zonaprop" else flat_text)
        if data["price"] is None:
            continue  # sin precio en USD: no se puede comparar
        url = href if href.startswith("http") else base_url.split("/", 3)[0] + "//" + base_url.split("/")[2] + href
        url = url.split("?")[0]
        title = re.sub(r"^[-\s]+", "", a.get_text(" ", strip=True))[:90]
        listings[lid] = {
            "id": lid,
            "site": site,
            "url": url,
            "title": title,
            "blurb": (sep_text if site == "zonaprop" else flat_text)[:500],
            "photo": card_photo(card, url),
            **data,
        }
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
    if filters:
        apply_budget(item, filters)
    return item


def prefer(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda x: (-x.get("score", 0), x["price"]))


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


def listing_key(item: dict) -> str:
    street = street_key(item.get("address") or "")
    if not street or item.get("price") is None:
        return ""
    area = item.get("area")
    area_b = str(int(round(area))) if area is not None else "x"
    amb = item["ambientes"] if item.get("ambientes") is not None else "x"
    return f"{street}|{item['price']}|{area_b}|{amb}"


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


def is_rejected(item: dict, f: dict) -> bool:
    """Pozo/cuotas sobre el texto; otros barrios solo en dirección/URL."""
    text_kws = f.get("reject_text")
    if text_kws is None:
        text_kws = f.get("reject") or []
    hay = _haystack(item, "any")
    if any(_phrase_in(hay, kw) for kw in text_kws if str(kw).strip()):
        return True
    loc = _location_hay(item)
    return any(_phrase_in(loc, kw) for kw in f.get("reject_barrios") or [] if str(kw).strip())


def in_allowed_area(item: dict, f: dict) -> bool:
    """Tiene que nombrar uno de los 4 barrios (todos CABA)."""
    allowed = [fold(b) for b in f.get("allowed_barrios") or [] if str(b).strip()]
    if not allowed:
        return True
    return any(b in _haystack(item, "any") for b in allowed)


def keep_listing(item: dict, src: dict, f: dict) -> bool:
    return keep_zone(item, src) and not is_rejected(item, f) and in_allowed_area(item, f)


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
    if item["area"] is None:
        return bool(f.get("include_unknown_area", True))
    return item["area"] >= f["min_area_m2"]


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
    if item.get("usd_per_m2") is not None:
        return item["usd_per_m2"]
    return usd_per_m2(item.get("price"), item.get("area"))


def zone_medians(listings: list[dict], min_n: int = 8) -> dict[str, dict]:
    buckets: dict[str, list[int]] = {}
    for i in listings:
        if i.get("active") is False:
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
    return medians


# ----------------------------------------------------------------- fetching --

def page_url(site: str, url: str, n: int) -> str:
    if n == 1:
        return url
    if site == "argenprop":
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}pagina-{n}"
    return url.replace(".html", f"-pagina-{n}.html")


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
    max_pages = cfg["pages"][site]
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
            i["zone"] = src["name"]
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


def coverage_warning(label: str, last_page_items: list[dict], seen_ids: set[str], filters: dict, pages: int) -> str | None:
    unseen = coverage_unseen(last_page_items, seen_ids, filters)
    if not unseen:
        return None
    return f"{pages} páginas pueden no alcanzar para {label}"


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


def tg_send(token: str, chat_id: str, text: str) -> None:
    _tg_post(
        token,
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )


def tg_send_photo(token: str, chat_id: str, photo: str, caption: str) -> None:
    _tg_post(
        token,
        "sendPhoto",
        {
            "chat_id": chat_id,
            "photo": photo,
            "caption": caption[:1024],
            "parse_mode": "HTML",
        },
    )


def why_line(i: dict) -> str:
    tags = [t for t in (i.get("tags") or []) if t]
    if tags:
        return "por qué: " + " · ".join(html.escape(t) for t in tags)
    return "por qué: cumple precio, m² y zona"


def _fmt_int(n: int) -> str:
    return f"{n:,}".replace(",", ".")


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
    return lines


def fmt_item(i: dict, tag: str = "🆕") -> str:
    area = f"{i['area']:g} m²" if i["area"] is not None else "m² s/d"
    amb = f"{i['ambientes']} amb" if i["ambientes"] is not None else "amb s/d"
    site = "Argenprop" if i["site"] == "argenprop" else "Zonaprop"
    where = html.escape(i.get("address") or i["title"])
    extra = ""
    if i.get("old_price"):
        extra = f" (antes USD {i['old_price']:,})".replace(",", ".")
    price = f"USD {i['price']:,}".replace(",", ".")
    extra_lines = "".join(f"\n{html.escape(x)}" for x in decision_lines(i))
    return (
        f"{tag} <b>{price}</b>{extra} · {area} · {amb}\n"
        f"📍 {html.escape(i['zone'])} — {where}"
        f"{extra_lines}\n"
        f"{why_line(i)}\n"
        f"🔗 {site}: {html.escape(i['url'])}"
        f"{site_footer()}"
    )


def notify_payloads(intro: str, items: list[dict], errors_block: str) -> list[dict]:
    """Un payload por pieza: intro/errores son texto; cada aviso puede llevar foto."""
    out: list[dict] = []
    if intro:
        out.append({"text": intro + site_footer(), "kind": "intro"})
    for i in items:
        out.append(
            {
                "text": fmt_item(i, i.get("_tag") or "🆕"),
                "photo": i.get("photo") or "",
                "item_id": i.get("id"),
                "kind": "item",
            }
        )
    if errors_block:
        out.append({"text": errors_block + site_footer(), "kind": "error"})
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
        ok = False
        try:
            if photo:
                try:
                    tg_send_photo(token, chat_id, photo, p["text"])
                    ok = True
                except requests.RequestException as e:
                    print(
                        f"[telegram] foto falló ({redact_secrets(e, token)}); mando texto",
                        file=sys.stderr,
                    )
                    tg_send(token, chat_id, p["text"])
                    ok = True
            else:
                tg_send(token, chat_id, p["text"])
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

SITES = ("zonaprop", "argenprop")


def seen_path(site: str) -> Path:
    return STATE_DIR / f"seen-{site}.json"


def listings_path(site: str) -> Path:
    return WEB_DATA_DIR / f"listings-{site}.json"


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


def apply_live_to_catalog(catalog: dict, items: list[dict], now: str) -> None:
    by_id = _catalog_map(catalog)
    for i in items:
        by_id[i["id"]] = upsert_listing(by_id.get(i["id"]), i, now, active=True)
    catalog["listings"] = sorted(by_id.values(), key=lambda x: x.get("id") or "")


def classify_changes(matched: list[dict], state: dict) -> tuple[list[dict], list[dict]]:
    new_items, drops = [], []
    for i in matched:
        prev = find_prev(i, state)
        if prev is None:
            new_items.append(i)
        elif i["price"] is not None and prev.get("price") is not None and i["price"] < prev["price"]:
            drops.append({**i, "old_price": prev["price"]})
    return prefer(new_items), prefer(drops)


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

    new_items, drops = classify_changes(matched, state)
    for d in drops:
        apply_decision(d, zone_medians(pool_for_median(matched, extra), cfg.get("median_min_n", 8)), cfg, now)
    print(
        f"[{site}] filtros: {len(matched)} · nuevos: {len(new_items)} · "
        f"bajas de precio: {len(drops)} · primera={first_run}"
    )

    intro = ""
    show: list[dict] = []
    if first_run:
        intro = (
            f"✅ Buscador activo ({site}). Cargué {len(matched)} avisos (con balcón, m², ambientes, "
            f"hasta USD 140k). El gusto es 125k; un poco más entra pero más abajo. "
            f"Época / reciclar / edificio pesan más que el precio. De ahora en más, solo nuevos."
        )
        show = [{**i, "_tag": "📌"} for i in prefer(matched)[:10]]
    else:
        show = [{**i, "_tag": "🆕"} for i in new_items] + [{**i, "_tag": "📉"} for i in drops]

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
            intro = f"⏱ Corrida {site}: sin novedades."

    payloads = notify_payloads(intro, show, err_block)
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
    if first_run and intro_ok:
        apply_live_to_catalog(catalog, matched, now)
        catalog_dirty = True
    else:
        live_notify = [i for i in new_items + drops if i["id"] in mark_ids]
        live_seen = [i for i in matched if i["id"] in state["listings"]]
        # Enriquecer avisos ya vistos sin reescribir last_seen: solo si cambió precio (drop).
        apply_live_to_catalog(catalog, live_notify, now)
        if live_notify:
            catalog_dirty = True
        # Avisos ya conocidos que siguen: actualizar ficha (foto, tags) solo si hay drop/new.
        # Los que ya estaban no se reescriben salvo baja de precio o alta.
        _ = live_seen

    configured = {src["name"] for src in cfg.get("sources") or [] if src.get("site") == site}
    gone_ids = mark_gone(catalog, ok_zones, {i["id"] for i in matched}, now, all_zones=configured)
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

    real_change = bool(mark_ids or gone_ids or (notify_coverage and not dry_run))
    if real_change and not dry_run:
        save_portal(site, state, catalog, prev_state, prev_catalog)
    elif notify_error and error_ok:
        # Error real avisado: no commitear seen solo por last_error_day.
        # Se reintenta el aviso al día siguiente si el error sigue; si se fue, no importa.
        pass

    _ = heartbeat
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", choices=["argenprop", "zonaprop"])
    args = ap.parse_args()

    cfg = json.loads(CONFIG_PATH.read_text())
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
            ok_zones[site].add(src["name"])
            print(f"[ok] {label}: {len(items)} avisos")
            last_pages[site].append((label, last_page))
            for i in items:
                current[site][i["id"]] = i
        except (Blocked, requests.RequestException) as e:
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
        max_pages = cfg["pages"].get(site, 3)
        coverage_notes = []
        for label, last_page in last_pages[site]:
            warn = coverage_warning(label, last_page, seen_ids, cfg["filters"], max_pages)
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
