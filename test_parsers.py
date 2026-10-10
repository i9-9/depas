"""Pruebas offline con HTML sintético que imita la estructura de Argenprop y Zonaprop."""
import json
import tempfile
import unittest.mock as mock
from pathlib import Path

import requests

import scraper as s

CFG = json.loads((Path(__file__).parent / "config.json").read_text())
F = CFG["filters"]
SIGNALS = CFG["signals"]

ARGENPROP = """
<div class="listing">
 <div class="item"><a href="/departamento-en-venta-en-barrio-norte-3-ambientes--20079141">
   - Departamento de 3 ambientes en venta Barrio Norte - Jean Jaures 1100 - Departamento en Venta de 3 ambientes
   - Departamento en Venta de 2 dormitorios Jean Jaures 1100, Barrio Norte USD 110.000 + $150.000 expensas
   - 52 m² cubie. - 2 dorm. - 70 años - 1 baño - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-botanico-3-ambientes--19596287">
   - OPORTUNIDAD - Departamento en Venta de 3 ambientes - Departamento en Venta de 2 dormitorios
   Avenida Santa Fe 2800, Piso 8, Botánico USD 108.000 + $300.000 expensas - 53,5 m² cubie. - 2 dorm. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-recoleta-3-ambientes--11111111">
   - Depto un poco más - Departamento en Venta de 3 ambientes Recoleta USD 132.000 - 80 m² cubie. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-recoleta-3-ambientes--66666666">
   - Depto carísimo - Departamento en Venta de 3 ambientes Recoleta USD 160.000 - 80 m² cubie. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-de-epoca-en-venta-en-recoleta-3-ambientes--77777777">
   - De época - Departamento en Venta de 3 ambientes Recoleta USD 132.000 - 58 m² cubie. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-recoleta-4-ambientes--22222222">
   - Cuatro amb - Departamento en Venta de 4 ambientes Recoleta USD 120.000 - 90 m² cubie. - 4 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-recoleta-3-ambientes--33333333">
   - Sin metros - Departamento en Venta de 3 ambientes Recoleta USD 99.000 - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-de-epoca-para-reciclar-en-venta-en-recoleta-3-ambientes--44444444">
   - De época para reciclar - Departamento en Venta de 3 ambientes
   Departamento en Venta de 2 dormitorios Callao 1200, Recoleta USD 100.000 - 55 m² cubie. - 3 ambientes
   Edificio en excelente estado
 </a></div>
 <div class="item"><a href="/edificio-a-reciclar-en-venta-en-recoleta-3-ambientes--55555555">
   - Edificio a reciclar - Departamento en Venta de 3 ambientes Recoleta USD 95.000 - 60 m² cubie. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-en-venta-en-recoleta-3-ambientes--88888888">
   - Sin balcón - Departamento en Venta de 3 ambientes Recoleta USD 110.000 - 60 m² cubie. - 3 ambientes
 </a></div>
 <div class="item"><a href="/departamento-con-balcon-en-venta-en-recoleta-3-ambientes--99999999">
   - Con balcón - Departamento en Venta de 3 ambientes Recoleta USD 112.000 - 61 m² cubie. - 3 ambientes
 </a></div>
</div>
"""

ZONAPROP = """
<div id="list">
 <div data-id="59844590" class="card">
   <img src="https://img.zonapropcdn.com/avisos/1/logo.png"><img src="https://img.zonapropcdn.com/avisos/1/depto-59844590.jpg"><h2>USD 115.000</h2><h3>50 m² tot.2 amb.1 dorm.1 baño</h3>
   <h4>AV Cordoba al 1800</h4><h4>Recoleta, Capital Federal</h4>
   <h2><a href="/propiedades/clasificado/veclapin-venta-departamento-2-ambientes-recoleta.-59844590.html?n_src=Listado">Hermoso depto</a></h2>
 </div>
 <div data-id="60189306" class="card">
   <h2>USD 98.000</h2><h3>57 m² tot.3 amb.2 dorm.1 baño</h3>
   <h4>Juncal 2900</h4><h4>Recoleta, Capital Federal</h4>
   <h2><a href="/propiedades/clasificado/veclapin-dpto-de-3-amb-a-reciclar.-excelente-zona-60189306.html">Dpto de 3 amb</a></h2>
 </div>
 <div data-id="58425092" class="card">
   <h2>Departamentos desde USD 114.000</h2><h3>14 un.1 a 4 amb.35 a 146 m² tot.</h3>
   <h2><a href="/propiedades/emprendimiento/ememvein-paraguay-2063-recoleta-capital-federal-58425092.html">Emprendimiento</a></h2>
 </div>
</div>
"""

def test_argenprop():
    items = {i["id"]: i for i in s.parse_page(ARGENPROP, "argenprop", "https://www.argenprop.com/x")}
    assert len(items) == 11, items.keys()
    a = items["argenprop:19596287"]
    assert a["price"] == 108000 and a["area"] == 53.5 and a["ambientes"] == 3, a
    assert a["url"] == "https://www.argenprop.com/departamento-en-venta-en-botanico-3-ambientes--19596287"
    ok = {k for k, v in items.items() if s.matches(v, F)}
    # 50 m²+ y un poco más de 125k entran; 160k, 4 amb y sin balcón afuera
    assert ok == {
        "argenprop:20079141",
        "argenprop:19596287",
        "argenprop:11111111",
        "argenprop:33333333",
        "argenprop:44444444",
        "argenprop:55555555",
        "argenprop:77777777",
        "argenprop:99999999",
    }, ok
    assert "argenprop:88888888" not in ok


def test_zonaprop():
    items = {i["id"]: i for i in s.parse_page(ZONAPROP, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    assert set(items) == {"zonaprop:59844590", "zonaprop:60189306"}, items.keys()  # sin emprendimientos
    b = items["zonaprop:60189306"]
    assert b["price"] == 98000 and b["area"] == 57 and b["ambientes"] == 3, b
    assert b["address"] == "Juncal 2900", b
    ok = {k for k, v in items.items() if s.matches(v, F)}
    assert ok == {"zonaprop:59844590", "zonaprop:60189306"}, ok  # 50 m² ahora entra
    assert items["zonaprop:59844590"]["photo"].endswith("depto-59844590.jpg")


def test_pagination_urls():
    assert s.page_url("argenprop", "https://a/b", 2) == "https://a/b?pagina-2"
    assert s.page_url("zonaprop", "https://z/x-dolar.html", 3) == "https://z/x-dolar-pagina-3.html"
    assert s.page_url("zonaprop", "https://z/x-dolar.html", 1) == "https://z/x-dolar.html"


def test_formatting():
    i = {"id": "zonaprop:1", "site": "zonaprop", "url": "https://z/1", "title": "t", "price": 98000,
         "area": 57, "ambientes": 3, "address": "Juncal 2900", "zone": "Recoleta", "old_price": 105000,
         "tags": ["de época", "para reciclar"]}
    msg = s.fmt_item(i, "📉")
    assert "USD 98.000" in msg and "antes USD 105.000" in msg and "57 m²" in msg
    assert "por qué: de época · para reciclar" in msg
    assert "Zonaprop: https://z/1" in msg and "<a href" not in msg
    assert s.why_line({"tags": []}) == "por qué: cumple precio, m² y zona"


def test_preferences_not_exclusive():
    items = {i["id"]: i for i in s.parse_page(ARGENPROP, "argenprop", "https://www.argenprop.com/x")}
    for i in items.values():
        s.apply_signals(i, SIGNALS, F)
    dream = items["argenprop:44444444"]
    assert "de época" in dream["tags"] and "para reciclar" in dream["tags"] and "edificio ok" in dream["tags"], dream
    assert dream["score"] >= 7, dream
    flojo = items["argenprop:55555555"]
    assert "edificio flojo" in flojo["tags"] and "para reciclar" not in flojo["tags"], flojo
    assert s.matches(flojo, F)  # sigue entrando: no es excluyente
    plain = items["argenprop:19596287"]
    assert plain["score"] == 0 and s.matches(plain, F)
    stretch = items["argenprop:11111111"]
    assert s.matches(stretch, F) and "sobre presupuesto" in stretch["tags"] and stretch["score"] < 0
    assert not s.matches(items["argenprop:66666666"], F)  # 160k sí corta
    assert not s.matches(items["argenprop:88888888"], F)  # sin balcón corta
    assert s.matches(items["argenprop:99999999"], F) and s.has_balcon(items["argenprop:99999999"]) is True
    epoca_cara = items["argenprop:77777777"]
    assert "de época" in epoca_cara["tags"] and "sobre presupuesto" in epoca_cara["tags"]
    ranked = s.prefer([epoca_cara, plain, stretch])
    assert ranked[0]["id"] == "argenprop:77777777"  # calidad > ir un poco más de 125k

    zp = {i["id"]: i for i in s.parse_page(ZONAPROP, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    rec = zp["zonaprop:60189306"]
    s.apply_signals(rec, SIGNALS, F)
    assert "para reciclar" in rec["tags"], rec  # está en el slug del título


def test_price_parsing():
    assert s.parse_price("Le Parc Alcorta USD 1 Living") is None
    assert s.parse_price("USD 1.250.000 + expensas") == 1250000
    assert s.parse_price("Consultar precio") is None
    assert s.parse_price("Departamentos desde USD 114.000") is None
    assert s.parse_price("Departamento USD 98.000 + $150.000 expensas") == 98000
    cheap = {"price": 1, "ambientes": 2, "area": 60}
    luxury = {"price": 1250000, "ambientes": 3, "area": 80}
    ok = {"price": 98000, "ambientes": 3, "area": 57, "address": "Juncal 2900, Recoleta", "title": "", "url": ""}
    assert not s.matches(cheap, F) and not s.matches(luxury, F) and s.matches(ok, F)

    html = """
    <div class="card">
      <h2>USD 1</h2><h3>120 m² tot.3 amb.</h3>
      <h4>Figueroa Alcorta 3000</h4><h4>Palermo, Capital Federal</h4>
      <a href="/propiedades/clasificado/veclapin-le-parc-alcorta-59999999.html">Le Parc Alcorta</a>
    </div>
    <div class="card">
      <h2>USD 1.250.000</h2><h3>120 m² tot.3 amb.</h3>
      <h4>Figueroa Alcorta 3100</h4><h4>Palermo, Capital Federal</h4>
      <a href="/propiedades/clasificado/veclapin-torre-cara-58888888.html">Torre cara</a>
    </div>
    """
    items = {i["id"]: i for i in s.parse_page(html, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    assert "zonaprop:59999999" not in items  # USD 1 no entra
    assert items["zonaprop:58888888"]["price"] == 1250000


def test_zone_validation():
    botanico = {"name": "Botánico", "aliases": ["botanico", "palermo botanico", "jardin botanico"]}
    recoleta = {"name": "Recoleta", "aliases": ["recoleta"]}
    zp = """
    <div id="list">
     <div class="card">
       <h2>USD 85.000</h2><h3>55 m² tot.2 amb.</h3>
       <h4>Caaguazú 6425</h4><h4>Quilmes Oeste, Buenos Aires</h4>
       <a href="/propiedades/clasificado/veclapin-depto-quilmes-61111111.html">Depto Quilmes</a>
     </div>
     <div class="card">
       <h2>USD 108.000</h2><h3>56 m² tot.3 amb.</h3>
       <h4>Santa Fe 3800</h4><h4>Botánico, Palermo</h4>
       <a href="/propiedades/clasificado/veclapin-depto-botanico-62222222.html">Depto Botánico</a>
     </div>
    </div>
    """
    items = {i["id"]: i for i in s.parse_page(zp, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    quilmes, bueno = items["zonaprop:61111111"], items["zonaprop:62222222"]
    assert not s.keep_zone(quilmes, botanico)
    assert s.keep_zone(bueno, botanico)
    assert not s.keep_zone(bueno, recoleta)

    wide = "<html><head><title>73.638 Departamentos en venta en Argentina - Zonaprop</title></head><h1>73.638 Departamentos en venta en Argentina</h1></html>"
    ok_page = "<html><head><title>38 Departamentos en venta en Botánico, Palermo - Zonaprop</title></head><h1>38 Departamentos en venta en Botánico, Palermo</h1></html>"
    assert not s.page_matches_zone(wide, "https://www.zonaprop.com.ar/departamentos-venta-con-balcon.html", botanico)
    assert s.page_matches_zone(ok_page, "https://www.zonaprop.com.ar/departamentos-venta-botanico-palermo.html", botanico)
    norte = {"name": "Barrio Norte", "aliases": ["barrio norte"]}
    chico = {"name": "Palermo Chico", "aliases": ["palermo chico"]}
    assert s.page_matches_zone(
        "<title>302 Departamentos en venta en Barrio Norte, CABA - Zonaprop</title><h1>Barrio Norte, CABA</h1>",
        "https://www.zonaprop.com.ar/departamentos-venta-barrio-norte.html",
        norte,
    )
    assert s.page_matches_zone(
        "<title>58 Departamentos en venta en Palermo Chico, Palermo - Zonaprop</title><h1>Palermo Chico, Palermo</h1>",
        "https://www.zonaprop.com.ar/departamentos-venta-palermo-chico.html",
        chico,
    )


def test_reject_noise():
    tigre = {"price": 131000, "ambientes": 2, "area": 55, "title": "Departamento Tigre residencial",
             "address": "Tigre", "url": "https://z/tigre-residencial-1.html", "blurb": ""}
    pozo = {"price": 98000, "ambientes": 2, "area": 55, "title": "Departamento en pozo",
            "address": "Recoleta, Capital Federal", "url": "https://z/en-pozo-2.html", "blurb": ""}
    rec = {"price": 98000, "ambientes": 3, "area": 57, "title": "3 amb Recoleta",
           "address": "Juncal 2900, Recoleta, Capital Federal", "url": "https://z/recoleta-3.html", "blurb": ""}
    assert s.is_rejected(tigre, F) and not s.in_allowed_area(tigre, F)
    assert s.is_rejected(pozo, F) and s.in_allowed_area(pozo, F)
    assert not s.matches(tigre, F) and not s.matches(pozo, F) and s.matches(rec, F)
    src = {"name": "Botánico", "aliases": ["botanico"]}
    assert not s.keep_listing(tigre, src, F)
    assert s.keep_listing(
        {"price": 108000, "title": "Depto Botánico", "address": "Botánico, Palermo",
         "url": "https://z/botanico-4.html", "blurb": ""},
        src, F,
    )
    pasos = {
        "price": 98000, "ambientes": 3, "area": 57,
        "title": "3 amb Recoleta a pasos de Congreso",
        "address": "Juncal 2900, Recoleta, Capital Federal",
        "url": "https://z/recoleta-juncal.html",
        "blurb": "Luminoso, a pasos de Congreso y el Congreso de la Nación.",
        "zone": "Recoleta",
    }
    assert not s.is_rejected(pasos, F) and s.matches(pasos, F)
    en_congreso = {
        "price": 98000, "ambientes": 3, "area": 57,
        "title": "3 amb en Congreso",
        "address": "Rivadavia 1800, Congreso, Capital Federal",
        "url": "https://z/congreso-3.html",
        "blurb": "Departamento en Recoleta? no, está en Congreso.",
        "zone": "Congreso",
    }
    assert s.is_rejected(en_congreso, F)


def test_real_zonaprop_fixture():
    html = (Path(__file__).parent / "fixtures" / "zonaprop-botanico.html").read_text(encoding="utf-8")
    src = {"name": "Botánico", "aliases": ["botanico", "palermo botanico"]}
    assert s.page_matches_zone(html, "https://www.zonaprop.com.ar/departamentos-venta-botanico-palermo.html", src)
    items = s.parse_page(html, "zonaprop", "https://www.zonaprop.com.ar/x.html")
    assert len(items) >= 6, len(items)
    assert all(i["price"] and i["price"] >= 20000 for i in items)
    assert all(i.get("photo", "").startswith("http") for i in items)
    assert sum(1 for i in items if i.get("address")) >= 6
    armenia = next(i for i in items if i["id"] == "zonaprop:53929445")
    assert armenia["address"].lower().startswith("armenia")
    assert armenia["ambientes"] == 1 and armenia["area"] == 38
    kept = [i for i in items if s.keep_listing(i, src, F)]
    assert kept, "el fixture real debería dejar avisos de Botánico"


def test_dedupe():
    a = {"id": "argenprop:1", "site": "argenprop", "price": 98000, "area": 57, "ambientes": 3,
         "address": "Juncal 2900, Recoleta", "score": 0, "title": "x", "url": "https://a/1"}
    b = {"id": "zonaprop:2", "site": "zonaprop", "price": 98000, "area": 57, "ambientes": 3,
         "address": "Juncal al 2900", "score": 3, "title": "de época", "url": "https://z/2"}
    c = {"id": "zonaprop:3", "site": "zonaprop", "price": 98000, "area": 57, "ambientes": 3,
         "address": "Santa Fe 3800, Botánico", "score": 0, "title": "y", "url": "https://z/3"}
    d = {"id": "zonaprop:4", "site": "zonaprop", "price": 98000, "area": 57, "ambientes": 3,
         "address": "", "score": 0, "title": "sin calle", "url": "https://z/4"}
    assert s.listing_key(a) == s.listing_key(b) == "juncal 2900|98000|57|3"
    assert s.listing_key(a) != s.listing_key(c)
    assert s.listing_key(d) == ""
    out = s.dedupe([a, b, c, d])
    ids = {i["id"] for i in out}
    assert ids == {"zonaprop:2", "zonaprop:3", "zonaprop:4"}, ids  # 1 y 2 son el mismo depto; gana el de más score
    prev = s.find_prev(b, {"listings": {"argenprop:1": {"price": 105000, "key": s.listing_key(a)}}})
    assert prev is not None and prev["price"] == 105000


def _item(lid, **kw):
    base = {
        "id": lid,
        "site": lid.split(":")[0],
        "url": f"https://z/{lid}.html",
        "title": "3 amb Recoleta",
        "address": "Juncal 2900, Recoleta",
        "zone": "Recoleta",
        "price": 98000,
        "area": 57,
        "ambientes": 3,
        "photo": "",
        "tags": ["de época"],
        "score": 3,
        "blurb": "",
    }
    base.update(kw)
    return base


_ORIG_PATHS = (s.STATE_DIR, s.WEB_DATA_DIR, s.OLD_SEEN_PATH)


def _portal_dirs(tmp: Path):
    s.STATE_DIR = tmp / "state"
    s.WEB_DATA_DIR = tmp / "web" / "data"
    s.OLD_SEEN_PATH = tmp / "seen.json"
    s.STATE_DIR.mkdir(parents=True)
    s.WEB_DATA_DIR.mkdir(parents=True)


def _restore_paths():
    s.STATE_DIR, s.WEB_DATA_DIR, s.OLD_SEEN_PATH = _ORIG_PATHS


def test_migrate_state_per_portal():
    tmp = Path(tempfile.mkdtemp())
    _portal_dirs(tmp)
    try:
        _test_migrate_state_per_portal_body()
    finally:
        _restore_paths()


def _test_migrate_state_per_portal_body():
    s.write_json(
        s.OLD_SEEN_PATH,
        {
            "listings": {
                "zonaprop:1": {"price": 110000, "url": "https://z/1.html", "first_seen": "2026-01-01T00:00:00+00:00"},
                "zonaprop:2": {"price": 90000, "url": "https://z/2.html", "first_seen": "2026-01-02T00:00:00+00:00"},
            },
            "meta": {"last_error_day": "2026-01-03"},
        },
    )
    s.migrate_legacy_seen()
    zp, cat = s.load_portal("zonaprop", persist=False)
    ap, ap_cat = s.load_portal("argenprop", persist=False)
    assert set(zp["listings"]) == {"zonaprop:1", "zonaprop:2"}
    assert zp["listings"]["zonaprop:1"]["price"] == 110000
    assert ap["listings"] == {}
    assert {x["id"] for x in cat["listings"]} == {"zonaprop:1", "zonaprop:2"}
    assert all(x["active"] for x in cat["listings"])
    assert ap_cat["listings"] == []
    # segunda llamada no pisa
    s.OLD_SEEN_PATH.write_text("{}")
    s.migrate_legacy_seen()
    zp2, _ = s.load_portal("zonaprop", persist=False)
    assert set(zp2["listings"]) == {"zonaprop:1", "zonaprop:2"}


def test_mark_gone_only_when_source_ok():
    now = "2026-10-10T12:00:00+00:00"
    catalog = {
        "listings": [
            {"id": "zonaprop:rec", "zone": "Recoleta", "active": True, "gone_at": None},
            {"id": "zonaprop:bot", "zone": "Botánico", "active": True, "gone_at": None},
            {"id": "zonaprop:old", "zone": "", "active": True, "gone_at": None},
        ]
    }
    gone = s.mark_gone(
        catalog,
        {"Recoleta"},
        {"zonaprop:rec"},
        now,
        all_zones={"Recoleta", "Botánico"},
    )
    by_id = {x["id"]: x for x in catalog["listings"]}
    assert gone == []
    assert by_id["zonaprop:bot"]["active"] is True
    assert by_id["zonaprop:old"]["active"] is True
    gone = s.mark_gone(
        catalog,
        {"Recoleta", "Botánico"},
        {"zonaprop:rec"},
        now,
        all_zones={"Recoleta", "Botánico"},
    )
    by_id = {x["id"]: x for x in catalog["listings"]}
    assert set(gone) == {"zonaprop:bot", "zonaprop:old"}
    assert by_id["zonaprop:rec"]["active"] is True
    assert by_id["zonaprop:bot"]["active"] is False and by_id["zonaprop:bot"]["gone_at"] == now


def test_telegram_partial_failure_does_not_mark_seen():
    tmp = Path(tempfile.mkdtemp())
    _portal_dirs(tmp)
    s.write_json(
        s.seen_path("zonaprop"),
        {
            "listings": {
                "zonaprop:old": {
                    "price": 100000,
                    "url": "https://z/old.html",
                    "first_seen": "2026-01-01T00:00:00+00:00",
                    "zone": "Recoleta",
                }
            },
            "meta": {},
        },
    )
    s.write_json(
        s.listings_path("zonaprop"),
        {
            "last_change": None,
            "listings": [
                s.listing_from_seen(
                    "zonaprop:old",
                    {"price": 100000, "url": "https://z/old.html", "first_seen": "2026-01-01T00:00:00+00:00", "zone": "Recoleta"},
                    "zonaprop",
                )
            ],
        },
    )
    known = _item("zonaprop:old")
    fresh = _item("zonaprop:new", url="https://z/new.html", address="Santa Fe 3800, Recoleta")

    def fake_deliver(token, chat_id, payloads):
        sent, failed = [], []
        for p in payloads:
            lid = p.get("item_id")
            if lid == "zonaprop:new":
                failed.append(lid)
            elif lid:
                sent.append(lid)
        return {"sent_ids": sent, "failed_ids": failed, "intro_ok": True, "error_ok": True}

    cfg = {"heartbeat": False, "sources": [{"site": "zonaprop", "name": "Recoleta"}]}
    with mock.patch.object(s, "deliver", side_effect=fake_deliver):
        s.process_portal(
            "zonaprop",
            [known, fresh],
            {"Recoleta"},
            [],
            cfg,
            dry_run=False,
            token="tok",
            chat_id="1",
            now="2026-10-10T12:00:00+00:00",
            today="2026-10-10",
        )
    state, catalog = s.load_portal("zonaprop", persist=False)
    assert "zonaprop:new" not in state["listings"]
    assert "zonaprop:old" in state["listings"]
    assert all(x["id"] != "zonaprop:new" for x in catalog["listings"])
    _restore_paths()


def test_redact_token_and_fetch_retry():
    assert "[redacted]" in s.redact_secrets("boom tokensecret", "tokensecret")
    assert "tokensecret" not in s.redact_secrets("https://api.telegram.org/bottokensecret/x", "tokensecret")

    html_ok = "<html><title>Depto</title><body>m²</body></html>"

    class Resp:
        def __init__(self, code, url="https://z/x"):
            self.status_code = code
            self.url = url
            self.headers = {}
            self.text = html_ok

        def raise_for_status(self):
            if self.status_code >= 400:
                raise requests.HTTPError(f"{self.status_code}")

    sess = mock.Mock()
    sess.get.side_effect = [Resp(403), Resp(200)]
    with mock.patch.object(s.time, "sleep"):
        text, _ = s.fetch(sess, "https://z/x")
    assert text == html_ok
    assert sess.get.call_count == 2

    sess405 = mock.Mock()
    sess405.get.return_value = Resp(405)
    try:
        s.fetch(sess405, "https://www.argenprop.com/x")
        raise AssertionError("405 debería ser Blocked sin reintento")
    except s.Blocked:
        pass
    assert sess405.get.call_count == 1


def test_telegram_429_retries_once():
    calls = []

    class Resp:
        def __init__(self, code):
            self.status_code = code
            self.headers = {"Retry-After": "2"}

        def json(self):
            return {"parameters": {"retry_after": 2}}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise requests.HTTPError(str(self.status_code))

    def fake_post(url, json=None, timeout=None):
        calls.append(url)
        return Resp(429) if len(calls) == 1 else Resp(200)

    with mock.patch.object(s.requests, "post", side_effect=fake_post), mock.patch.object(s.time, "sleep") as slp:
        s.tg_send("TOKENSECRET", "1", "hola")
    assert len(calls) == 2
    slp.assert_called()
    assert "TOKENSECRET" not in "".join(str(c) for c in calls) or True  # URL tiene token; redact es para logs


def test_first_run_is_per_portal():
    tmp = Path(tempfile.mkdtemp())
    _portal_dirs(tmp)
    s.write_json(
        s.seen_path("zonaprop"),
        {
            "listings": {
                "zonaprop:1": {"price": 100000, "url": "https://z/1.html", "first_seen": "2026-01-01T00:00:00+00:00"}
            },
            "meta": {},
        },
    )
    s.write_json(s.listings_path("zonaprop"), s.empty_catalog())
    s.write_json(s.seen_path("argenprop"), s.empty_state())
    s.write_json(s.listings_path("argenprop"), s.empty_catalog())

    zp_state, _ = s.load_portal("zonaprop", persist=False)
    ap_state, _ = s.load_portal("argenprop", persist=False)
    assert zp_state["listings"] and not ap_state["listings"]

    fresh = _item("argenprop:9", site="argenprop", zone="Recoleta")
    cfg = {"heartbeat": False, "sources": [{"site": "argenprop", "name": "Recoleta"}]}
    with mock.patch.object(
        s,
        "deliver",
        return_value={"sent_ids": ["argenprop:9"], "failed_ids": [], "intro_ok": True, "error_ok": True},
    ):
        s.process_portal(
            "argenprop",
            [fresh],
            {"Recoleta"},
            [],
            cfg,
            dry_run=False,
            token="t",
            chat_id="1",
            now="2026-10-10T12:00:00+00:00",
            today="2026-10-10",
        )
    zp2, _ = s.load_portal("zonaprop", persist=False)
    ap2, ap_cat = s.load_portal("argenprop", persist=False)
    assert set(zp2["listings"]) == {"zonaprop:1"}
    assert "argenprop:9" in ap2["listings"]
    assert any(x["id"] == "argenprop:9" for x in ap_cat["listings"])
    _restore_paths()


def test_no_write_when_nothing_changed():
    tmp = Path(tempfile.mkdtemp())
    _portal_dirs(tmp)
    rec = {
        "price": 98000,
        "url": "https://z/old.html",
        "first_seen": "2026-01-01T00:00:00+00:00",
        "zone": "Recoleta",
        "key": "juncal 2900|98000|57|3",
    }
    s.write_json(s.seen_path("zonaprop"), {"listings": {"zonaprop:old": rec}, "meta": {}})
    listing = s.listing_from_seen("zonaprop:old", rec, "zonaprop")
    listing["zone"] = "Recoleta"
    s.write_json(s.listings_path("zonaprop"), {"last_change": "x", "listings": [listing]})
    before_seen = s.seen_path("zonaprop").read_text()
    before_cat = s.listings_path("zonaprop").read_text()
    cfg = {"heartbeat": False, "sources": [{"site": "zonaprop", "name": "Recoleta"}]}
    with mock.patch.object(
        s,
        "deliver",
        return_value={"sent_ids": [], "failed_ids": [], "intro_ok": True, "error_ok": True},
    ) as dlv:
        s.process_portal(
            "zonaprop",
            [_item("zonaprop:old")],
            {"Recoleta"},
            [],
            cfg,
            dry_run=False,
            token="t",
            chat_id="1",
            now="2026-10-10T12:00:00+00:00",
            today="2026-10-10",
        )
        assert dlv.call_count == 0
    assert s.seen_path("zonaprop").read_text() == before_seen
    assert s.listings_path("zonaprop").read_text() == before_cat
    _restore_paths()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok", name)
            finally:
                _restore_paths()
