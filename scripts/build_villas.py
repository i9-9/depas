#!/usr/bin/env python3
"""Arma data/villas-caba.json: polígonos de villas y asentamientos de CABA (OpenStreetMap vía Nominatim).

Se corre a mano, rara vez (el mapa cambia poco). El resultado se commitea; el scraper solo lo lee.
Uso: python scripts/build_villas.py
Es una referencia geográfica, no un registro oficial: puede faltar algún barrio popular.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "data" / "villas-caba.json"
UA = "depas-search/1.0 (personal apartment search)"
# CABA: oeste, sur, este, norte
LEFT, BOTTOM, RIGHT, TOP = -58.5315, -34.7058, -58.3350, -34.5265
NOMINATIM = "https://nominatim.openstreetmap.org/search"

NAMES = [
    "Villa 31", "Villa 31 bis", "Villa 1-11-14", "Villa 20", "Villa 21-24", "Villa 15 Ciudad Oculta",
    "Villa 3 Soldati", "Barrio Los Piletones", "Villa 6 Cildáñez", "Barrio Rodrigo Bueno", "Villa Fátima",
    "Playón de Chacarita", "Barrio Fraga", "Asentamiento Lamadrid", "Villa 13 bis", "Barrio Carlos Mugica",
    "Barrio Papa Francisco", "Villa 19 INTA", "Barrio Ramón Carrillo", "Barrio Illia", "Villa 17",
    "Barrio Zavaleta", "Barrio Calacita", "Barrio Pirelli", "Villa Cildáñez", "Barrio Obrero",
    "Barrio Samoré", "Villa Pueyrredón asentamiento", "Barrio Cartón", "Barrio Rawson",
]
GENERIC = ["villa", "asentamiento", "barrio popular", "villa de emergencia", "barrio emergente"]


# Resultados de Nominatim que NO son villas: barrios/comunas enteros, plazas y conjuntos habitacionales.
EXCLUDE_NAMES = (
    "buenos aires", "villa soldati", "barrio soldati", "plaza", "hogar obrero", "obrero m.t.", "popular pampa",
)
MAX_SPAN_DEG = 0.03  # un polígono de más de ~3 km no es una villa


def keep(v: dict) -> bool:
    n = v["name"].lower()
    if v.get("type") == "park" or any(x in n for x in EXCLUDE_NAMES):
        return False
    pts = [p for ring in v["rings"] for p in ring]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (max(xs) - min(xs)) <= MAX_SPAN_DEG and (max(ys) - min(ys)) <= MAX_SPAN_DEG


def in_caba(lat: float, lon: float) -> bool:
    return BOTTOM <= lat <= TOP and LEFT <= lon <= RIGHT


def ring_of(geo: dict) -> list[list[list[float]]]:
    """Anillos exteriores [lon, lat] de un Polygon/MultiPolygon."""
    if geo["type"] == "Polygon":
        return [geo["coordinates"][0]]
    if geo["type"] == "MultiPolygon":
        return [p[0] for p in geo["coordinates"]]
    return []


def thin(ring: list[list[float]], keep: int = 80) -> list[list[float]]:
    step = max(1, len(ring) // keep)
    out = ring[::step]
    if out[-1] != ring[-1]:
        out.append(ring[-1])
    return [[round(x, 5), round(y, 5)] for x, y in out]


def search(q: str, limit: int) -> list[dict]:
    for attempt in range(4):
        try:
            r = requests.get(
                NOMINATIM,
                params={
                    "q": q, "format": "jsonv2", "limit": limit, "polygon_geojson": 1, "polygon_threshold": 0.00005,
                    "viewbox": f"{LEFT},{TOP},{RIGHT},{BOTTOM}", "bounded": 1,
                },
                headers={"User-Agent": UA},
                timeout=60,
            )
            r.raise_for_status()
            time.sleep(1.2)  # política de uso de Nominatim: 1 pedido por segundo
            return r.json()
        except (requests.RequestException, ValueError) as e:
            print(f"  reintento {attempt + 1} para {q!r}: {e}", flush=True)
            time.sleep(5 * (attempt + 1))
    print(f"  salteado: {q!r}", flush=True)
    return []


def main() -> None:
    found: dict[str, dict] = {}
    for q in [*(f"{n}, Buenos Aires" for n in NAMES), *GENERIC]:
        limit = 3 if q not in GENERIC else 40
        for x in search(q, limit):
            lat, lon = float(x["lat"]), float(x["lon"])
            if not in_caba(lat, lon):
                continue
            key = f"{x['osm_type']}{x['osm_id']}"
            if key in found:
                continue
            geo = x.get("geojson") or {}
            rings = ring_of(geo)
            if not rings:
                continue  # un punto suelto no sirve para medir distancia
            name = x.get("name") or x["display_name"].split(",")[0]
            found[key] = {
                "name": name,
                "where": ", ".join(x["display_name"].split(",")[1:3]).strip(),
                "type": x.get("type"),
                "rings": [thin(r) for r in rings],
            }
        print(f"{q!r}: {len(found)} acumulados", flush=True)
    OUT.parent.mkdir(exist_ok=True)
    found = {k: v for k, v in found.items() if keep(v)}
    OUT.write_text(json.dumps({"source": "OpenStreetMap (ODbL) vía Nominatim", "villas": list(found.values())}, ensure_ascii=False))
    for v in found.values():
        print(f"- {v['name']} ({v['type']}) · {v['where']}")


if __name__ == "__main__":
    main()
