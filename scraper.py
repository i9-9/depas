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
STATE_PATH = ROOT / "seen.json"

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
    """Pozo, cuotas u otro barrio: no entra aunque el resto cierre."""
    hay = _haystack(item, "any")
    return any(_phrase_in(hay, kw) for kw in f.get("reject") or [] if str(kw).strip())


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


# ----------------------------------------------------------------- fetching --

def page_url(site: str, url: str, n: int) -> str:
    if n == 1:
        return url
    if site == "argenprop":
        return f"{url}?pagina-{n}"
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


def fetch(session: requests.Session, url: str) -> tuple[str, str]:
    r = session.get(url, timeout=30)
    if r.url.split("?")[0].rstrip("/") != url.split("?")[0].rstrip("/"):
        print(f"[fetch] redirect {url} → {r.url}", file=sys.stderr)
    waf = (r.headers.get("x-amzn-waf-action") or "").lower()
    if r.status_code == 202 or waf in ("challenge", "block"):
        _log_fetch_failure(url, r)
        raise Blocked(f"HTTP {r.status_code} (WAF {waf or 'challenge'})")
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


def scrape_source(session, src: dict, cfg: dict) -> list[dict]:
    site = src["site"]
    found: dict[str, dict] = {}
    for n in range(1, cfg["pages"][site] + 1):
        url = page_url(site, src["url"], n)
        html_text, final_url = fetch(session, url)
        if n == 1 and not page_matches_zone(html_text, final_url, src):
            raise Blocked(f"slug inválido: redirigió fuera de {src['name']} → {final_url}")
        items = [i for i in parse_page(html_text, site, url) if keep_listing(i, src, cfg.get("filters") or {})]
        new = [i for i in items if i["id"] not in found]
        if n == 1 and not items:
            raise Blocked("0 avisos de la zona en la página 1 (¿cambió el HTML o el slug?)")
        if not new:
            break
        for i in new:
            i["zone"] = src["name"]
            apply_signals(i, cfg.get("signals") or [], cfg.get("filters") or {})
            found[i["id"]] = i
        time.sleep(random.uniform(*cfg["delay_seconds"]))
    return list(found.values())


# ---------------------------------------------------------------- telegram --

def tg_send(token: str, chat_id: str, text: str) -> None:
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=30,
    )
    r.raise_for_status()


def tg_send_photo(token: str, chat_id: str, photo: str, caption: str) -> None:
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        json={
            "chat_id": chat_id,
            "photo": photo,
            "caption": caption[:1024],
            "parse_mode": "HTML",
        },
        timeout=30,
    )
    r.raise_for_status()


def why_line(i: dict) -> str:
    tags = [t for t in (i.get("tags") or []) if t]
    if tags:
        return "por qué: " + " · ".join(html.escape(t) for t in tags)
    return "por qué: cumple precio, m² y zona"


def fmt_item(i: dict, tag: str = "🆕") -> str:
    area = f"{i['area']:g} m²" if i["area"] is not None else "m² s/d"
    amb = f"{i['ambientes']} amb" if i["ambientes"] is not None else "amb s/d"
    site = "Argenprop" if i["site"] == "argenprop" else "Zonaprop"
    where = html.escape(i.get("address") or i["title"])
    extra = ""
    if i.get("old_price"):
        extra = f" (antes USD {i['old_price']:,})".replace(",", ".")
    price = f"USD {i['price']:,}".replace(",", ".")
    return (
        f"{tag} <b>{price}</b>{extra} · {area} · {amb}\n"
        f"📍 {html.escape(i['zone'])} — {where}\n"
        f"{why_line(i)}\n"
        f"🔗 {site}: {html.escape(i['url'])}"
    )


def notify_payloads(intro: str, items: list[dict], errors_block: str) -> list[dict]:
    """Un payload por pieza: intro/errores son texto; cada aviso puede llevar foto."""
    out: list[dict] = []
    if intro:
        out.append({"text": intro})
    for i in items:
        out.append({"text": fmt_item(i, i.get("_tag") or "🆕"), "photo": i.get("photo") or ""})
    if errors_block:
        out.append({"text": errors_block})
    return out


def deliver(token: str, chat_id: str, payloads: list[dict]) -> None:
    for p in payloads:
        photo = p.get("photo") or ""
        if photo:
            try:
                tg_send_photo(token, chat_id, photo, p["text"])
                time.sleep(1)
                continue
            except requests.RequestException as e:
                print(f"[telegram] foto falló ({e}); mando texto", file=sys.stderr)
        tg_send(token, chat_id, p["text"])
        time.sleep(1)


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


# -------------------------------------------------------------------- main --

def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"listings": {}, "meta": {}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", choices=["argenprop", "zonaprop"])
    args = ap.parse_args()

    cfg = json.loads(CONFIG_PATH.read_text())
    state = load_state()
    first_run = not state["listings"]
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not args.dry_run and not (token and chat_id):
        print("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID", file=sys.stderr)
        return 2

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9"})

    in_actions = os.environ.get("GITHUB_ACTIONS", "").lower() == "true"
    sources = [x for x in cfg["sources"] if not args.only or x["site"] == args.only]

    errors: list[str] = []
    skipped: list[str] = []
    ok_sources = 0
    current: dict[str, dict] = {}
    for src in sources:
        label = f"{src['site']} · {src['name']}"
        if in_actions and src["site"] == "argenprop":
            if not skipped:
                skipped.append("Argenprop: bloqueado desde Actions (correr en la Mac)")
            print(f"[skip] {label}: bloqueado desde Actions", file=sys.stderr)
            continue
        try:
            items = scrape_source(session, src, cfg)
            ok_sources += 1
            print(f"[ok] {label}: {len(items)} avisos")
            for i in items:
                current[i["id"]] = i
        except (Blocked, requests.RequestException) as e:
            errors.append(f"{label}: {e}")
            print(f"[error] {label}: {e}", file=sys.stderr)
        time.sleep(random.uniform(*cfg["delay_seconds"]))

    matched = dedupe([i for i in current.values() if matches(i, cfg["filters"])])
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    new_items, drops = [], []
    for i in matched:
        prev = find_prev(i, state)
        if prev is None:
            new_items.append(i)
        elif i["price"] < prev["price"]:
            drops.append({**i, "old_price": prev["price"]})
    new_items, drops = prefer(new_items), prefer(drops)
    print(f"Coinciden con filtros: {len(matched)} · nuevos: {len(new_items)} · bajas de precio: {len(drops)}")

    intro = ""
    show: list[dict] = []
    if first_run and ok_sources:
        intro = (
            f"✅ Buscador activo. Cargué {len(matched)} avisos (con balcón, m², ambientes, "
            f"hasta USD 140k). El gusto es 125k; un poco más entra pero más abajo. "
            f"Época / reciclar / edificio pesan más que el precio. De ahora en más, solo nuevos."
        )
        show = [{**i, "_tag": "📌"} for i in prefer(matched)[:10]]
    else:
        show = [{**i, "_tag": "🆕"} for i in new_items] + [{**i, "_tag": "📉"} for i in drops]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    notes = errors + skipped
    notify_error = bool(notes) and state["meta"].get("last_error_day") != today
    err_block = ""
    if notify_error:
        err_block = "⚠️ Problemas en esta corrida:\n" + "\n".join(f"• {html.escape(e)}" for e in notes)

    payloads = notify_payloads(intro, show, err_block)
    if args.dry_run:
        for p in payloads:
            extra = f"\n🖼 {p['photo']}" if p.get("photo") else ""
            print("-----\n" + p["text"] + extra)
        return 0

    deliver(token, chat_id, payloads)

    if ok_sources:
        for i in matched:
            prev = state["listings"].get(i["id"], {})
            rec = {
                "price": i["price"],
                "url": i["url"],
                "first_seen": prev.get("first_seen", now),
                "last_seen": now,
            }
            k = listing_key(i)
            if k:
                rec["key"] = k
            state["listings"][i["id"]] = rec
        state["meta"]["last_run"] = now
        if not notes:
            state["meta"].pop("last_error_day", None)
    if notify_error:
        state["meta"]["last_error_day"] = today
    if ok_sources or notify_error:
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True))

    return 0 if ok_sources or (skipped and not errors) else 1


if __name__ == "__main__":
    sys.exit(main())
