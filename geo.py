"""Geografía de la ruta de Mailén: dónde queda cada aviso y a cuántos metros de una villa.

- Coordenadas: las que trae Cabaprop, o el geocodificador oficial de la Ciudad (USIG) por calle y altura.
- Villas: polígonos de data/villas-caba.json (OpenStreetMap), armado con scripts/build_villas.py.
Todo es tolerante a fallas: si algo no responde, el aviso queda sin distancia, nunca rompe la corrida.
"""
from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
VILLAS_PATH = ROOT / "data" / "villas-caba.json"
USIG = "https://servicios.usig.buenosaires.gob.ar/normalizar/"
UA = "depas-search/1.0 (personal apartment search)"
CABA = (-34.7058, -34.5265, -58.5315, -58.3350)  # sur, norte, oeste, este

_villas_cache: list[dict] | None = None


def load_villas(path: Path | None = None) -> list[dict]:
    global _villas_cache
    if path is None and _villas_cache is not None:
        return _villas_cache
    p = path or VILLAS_PATH
    try:
        villas = json.loads(p.read_text(encoding="utf-8")).get("villas") or []
    except (OSError, ValueError):
        villas = []
    if path is None:
        _villas_cache = villas
    return villas


def _project(lat: float, lng: float, lat0: float) -> tuple[float, float]:
    """Metros aproximados (x este, y norte) alrededor de lat0: sobra para distancias de unos cientos de metros."""
    return lng * 111_320.0 * math.cos(math.radians(lat0)), lat * 110_574.0


def _seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _inside(px: float, py: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def nearest_villa(lat: float, lng: float, villas: list[dict] | None = None) -> tuple[int, str] | None:
    """(metros, nombre) de la villa más cercana. 0 si el punto cae adentro."""
    villas = load_villas() if villas is None else villas
    best: tuple[float, str] | None = None
    px, py = _project(lat, lng, lat)
    for v in villas:
        for ring in v.get("rings") or []:
            pts = [_project(y, x, lat) for x, y in ring]
            if len(pts) < 3:
                continue
            if _inside(px, py, pts):
                return 0, v["name"]
            d = min(_seg_dist(px, py, *pts[i], *pts[(i + 1) % len(pts)]) for i in range(len(pts)))
            if best is None or d < best[0]:
                best = (d, v["name"])
    return (int(round(best[0])), best[1]) if best else None


_STOP = re.compile(r"\b(?:entre|e/|esq\.?|esquina|casi|y)\b|(?<=\d)\s*\.|[,;(]", re.I)


def clean_address(address: str) -> str | None:
    """'Alcaraz 4400. Entre Segurola' -> 'Alcaraz 4400'; sin altura devuelve None."""
    head = _STOP.split(address or "", maxsplit=1)[0].strip()
    m = re.match(r"^(.*?)\s+(?:al\s+)?(\d{2,5})\b", head, re.I)
    if not m:
        return None
    street = re.sub(r"\s+", " ", m.group(1)).strip()
    return f"{street} {m.group(2)}" if street else None


def geocode(address: str, session: requests.Session | None = None) -> tuple[float, float] | None:
    """Calle y altura -> (lat, lng) con el normalizador oficial de la Ciudad; None si no responde o no entiende."""
    addr = clean_address(address)
    if not addr:
        return None
    get = (session or requests).get
    for attempt in range(5):
        try:
            r = get(
                USIG,
                params={"direccion": f"{addr}, CABA", "geocodificar": "true", "srid": 4326},
                headers={"User-Agent": UA},
                timeout=25,
            )
            if r.status_code != 200:
                raise requests.RequestException(str(r.status_code))
            rows = r.json().get("direccionesNormalizadas") or []
            if not rows:
                return None
            c = rows[0].get("coordenadas") or {}
            lat, lng = float(c["y"]), float(c["x"])
            if CABA[0] <= lat <= CABA[1] and CABA[2] <= lng <= CABA[3]:
                return lat, lng
            return None
        except (requests.RequestException, ValueError, KeyError, TypeError):
            time.sleep(2.0 * (attempt + 1))
    return None


def enrich_rows(rows: list[dict], cache: dict, *, max_new: int = 300, pause: float = 0.5) -> int:
    """Pone lat/lng y villa_m/villa_name en cada fila. `cache` {dirección: [lat, lng] | None} se guarda afuera.

    Devuelve cuántas direcciones nuevas geocodificó. Las que fallan no se cachean (se reintentan en otra corrida).
    """
    villas = load_villas()
    new = 0
    session = requests.Session()
    for row in rows:
        lat, lng = row.get("lat"), row.get("lng")
        if lat is None or lng is None:
            key = clean_address(row.get("address") or "")
            if not key:
                continue
            key = f"{key}|{row.get('zone') or ''}"
            if key in cache and cache[key]:
                lat, lng = cache[key]
            elif new < max_new:
                found = geocode(row.get("address") or "", session)
                new += 1
                time.sleep(pause)
                if found:
                    cache[key] = [found[0], found[1]]
                    lat, lng = found
        if lat is None or lng is None or not villas:
            continue
        row["lat"], row["lng"] = round(float(lat), 6), round(float(lng), 6)
        hit = nearest_villa(float(lat), float(lng), villas)
        if hit:
            row["villa_m"], row["villa_name"] = hit
    return new
