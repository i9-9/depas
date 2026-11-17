#!/usr/bin/env python3
"""Completa lat/lng y distancia a villas en los avisos ya guardados de la ruta de Mailén (sin volver a scrapear).

Reintenta lo que no se pudo ubicar. Uso: python scripts/geocode_amiga.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import geo  # noqa: E402

LISTINGS = ROOT / "web" / "data" / "listings-amiga.json"
CACHE = ROOT / "state" / "geocache.json"


def main() -> None:
    data = json.loads(LISTINGS.read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = [r for r in data["listings"] if r.get("active") is not False]
    before = sum(1 for r in rows if r.get("villa_m") is not None)
    new = geo.enrich_rows(rows, cache, max_new=400)
    after = sum(1 for r in rows if r.get("villa_m") is not None)
    LISTINGS.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
    print(f"{before} -> {after} de {len(rows)} con distancia a villas ({new} direcciones consultadas)")


if __name__ == "__main__":
    main()
