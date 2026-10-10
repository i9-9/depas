#!/usr/bin/env python3
"""Buscador de departamentos en venta (Argenprop + Zonaprop) con aviso por Telegram.

Uso:
    python scraper.py              # corrida normal (usa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)
    python scraper.py --dry-run    # no manda Telegram ni guarda estado, imprime en consola
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


def parse_card(site: str, text: str) -> dict:
    out = {"price": None, "area": None, "ambientes": None, "address": ""}

    m = re.search(r"USD\s*([\d.]+)", text)
    if m:
        out["price"] = to_price(m.group(1))

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
        m = re.search(r"\n([^\n]+)\n[^\n]*(?:Capital Federal|CABA)", text)
        if m and len(m.group(1)) < 120:
            out["address"] = m.group(1).strip()
    return out


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


def has_balcon(item: dict) -> bool | None:
    """True / False si el texto lo dice; None si la card no menciona balcón."""
    hay = _haystack(item, "any")
    if "sin balcon" in hay or "sin balcones" in hay:
        return False
    if "balcon" in hay or "balcones" in hay:
        return True
    return None


def matches(item: dict, f: dict) -> bool:
    hard = f.get("max_price_usd_hard", f["max_price_usd"])
    if item["price"] is None or item["price"] > hard:
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


def fetch(session: requests.Session, url: str) -> str:
    r = session.get(url, timeout=30)
    if r.status_code in (403, 429, 503):
        raise Blocked(f"HTTP {r.status_code} (posible bloqueo anti-bot)")
    if r.status_code == 404:
        raise Blocked("HTTP 404 (revisar el slug de la URL en config.json)")
    r.raise_for_status()
    head = r.text[:4000].lower()
    if any(k in head for k in BLOCK_MARKERS) and "m²" not in r.text:
        raise Blocked("página de desafío anti-bot")
    return r.text


def scrape_source(session, src: dict, cfg: dict) -> list[dict]:
    site = src["site"]
    found: dict[str, dict] = {}
    for n in range(1, cfg["pages"][site] + 1):
        url = page_url(site, src["url"], n)
        html_text = fetch(session, url)
        items = parse_page(html_text, site, url)
        new = [i for i in items if i["id"] not in found]
        if n == 1 and not items:
            raise Blocked("0 avisos en la página 1 (¿cambió el HTML o el slug?)")
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


def fmt_item(i: dict, tag: str = "🆕") -> str:
    area = f"{i['area']:g} m²" if i["area"] is not None else "m² s/d"
    amb = f"{i['ambientes']} amb" if i["ambientes"] is not None else "amb s/d"
    site = "Argenprop" if i["site"] == "argenprop" else "Zonaprop"
    where = html.escape(i.get("address") or i["title"])
    extra = ""
    if i.get("old_price"):
        extra = f" (antes USD {i['old_price']:,})".replace(",", ".")
    price = f"USD {i['price']:,}".replace(",", ".")
    tags = i.get("tags") or []
    pref = f"\n✦ {' · '.join(html.escape(t) for t in tags)}" if tags else ""
    return (
        f"{tag} <b>{price}</b>{extra} · {area} · {amb}{pref}\n"
        f"📍 {html.escape(i['zone'])} — {where}\n"
        f"🔗 <a href=\"{html.escape(i['url'])}\">{site}</a>"
    )


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

    errors: list[str] = []
    ok_sources = 0
    current: dict[str, dict] = {}
    for src in cfg["sources"]:
        label = f"{src['site']} · {src['name']}"
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

    matched = prefer([i for i in current.values() if matches(i, cfg["filters"])])
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    new_items, drops = [], []
    for i in matched:
        prev = state["listings"].get(i["id"])
        if prev is None:
            new_items.append(i)
        elif i["price"] < prev["price"]:
            drops.append({**i, "old_price": prev["price"]})
    new_items, drops = prefer(new_items), prefer(drops)
    print(f"Coinciden con filtros: {len(matched)} · nuevos: {len(new_items)} · bajas de precio: {len(drops)}")

    blocks: list[str] = []
    if first_run and ok_sources:
        blocks.append(
            f"✅ Buscador activo. Cargué {len(matched)} avisos (con balcón, m², ambientes, "
            f"hasta USD 140k). El gusto es 125k; un poco más entra pero más abajo. "
            f"Época / reciclar / edificio pesan más que el precio. De ahora en más, solo nuevos."
        )
        sample = prefer(matched)[:10]
        blocks += [fmt_item(i, "📌") for i in sample]
    else:
        blocks += [fmt_item(i) for i in new_items]
        blocks += [fmt_item(i, "📉") for i in drops]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    notify_error = bool(errors) and state["meta"].get("last_error_day") != today
    if notify_error:
        blocks.append("⚠️ Problemas en esta corrida:\n" + "\n".join(f"• {html.escape(e)}" for e in errors))

    if args.dry_run:
        for m in chunk_messages(blocks):
            print("-----\n" + m)
        return 0

    for m in chunk_messages(blocks):
        tg_send(token, chat_id, m)
        time.sleep(1)

    if ok_sources:
        for i in matched:
            prev = state["listings"].get(i["id"], {})
            state["listings"][i["id"]] = {
                "price": i["price"],
                "url": i["url"],
                "first_seen": prev.get("first_seen", now),
                "last_seen": now,
            }
        if notify_error:
            state["meta"]["last_error_day"] = today
        if not errors:
            state["meta"].pop("last_error_day", None)
        state["meta"]["last_run"] = now
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True))

    return 0 if ok_sources else 1


if __name__ == "__main__":
    sys.exit(main())
