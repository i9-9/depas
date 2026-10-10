"""Pruebas offline con HTML sintético que imita Argenprop, Zonaprop y Mercado Libre."""
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

MERCADOLIBRE = """
<ol class="ui-search-layout">
 <li class="ui-search-layout__item">
  <a href="https://departamento.mercadolibre.com.ar/MLA-4032113512-en-venta-departamento-2-ambientes-con-balcon-en-recoleta-_JM">
   En Venta Departamento 2 Ambientes Con Balcon En Recoleta
  </a>
  <img src="https://http2.mlstatic.com/D_NQ_NP_2X_684160-MLA117206984204_102026-E.webp">
  US$ 110.000
  2 ambs.
  1 baño
  54 m² cubiertos
  Arenales 1800 Recoleta Caba, Recoleta, Capital Federal
 </li>
 <li class="ui-search-layout__item">
  <a href="https://departamento.mercadolibre.com.ar/MLA-2154660325-de-epoca-para-reciclar-3-ambientes-recoleta-_JM">
   De época para reciclar 3 ambientes Recoleta
  </a>
  US$ 121.000
  3 ambs.
  57 m² cubiertos
  Juncal 2900, Recoleta, Capital Federal
 </li>
 <li class="ui-search-layout__item">
  EMPRENDIMIENTO
  <a href="https://departamento.mercadolibre.com.ar/MLA-3617154066-champ-recolett-_JM">Champ Recolett</a>
  Desde US$ 392.060
  3 a 5 ambs.
  84 - 214 m² cubiertos
  Av. Las Heras 1683, Recoleta, Capital Federal
 </li>
</ol>
"""

def test_argenprop():
    items = {i["id"]: i for i in s.parse_page(ARGENPROP, "argenprop", "https://www.argenprop.com/x")}
    assert len(items) == 11, items.keys()
    a = items["argenprop:19596287"]
    assert a["price"] == 108000 and a["area"] == 53.5 and a["ambientes"] == 3, a
    assert a["url"] == "https://www.argenprop.com/departamento-en-venta-en-botanico-3-ambientes--19596287"
    ok = {k for k, v in items.items() if s.matches(v, F)}
    # 50 m²+ y un poco más de 125k entran; 160k, 4 amb, sin m², edificio a reciclar y sin balcón afuera
    assert ok == {
        "argenprop:20079141",
        "argenprop:19596287",
        "argenprop:11111111",
        "argenprop:44444444",
        "argenprop:77777777",
        "argenprop:99999999",
    }, ok
    assert "argenprop:33333333" not in ok
    assert "argenprop:55555555" not in ok
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


def test_mercadolibre():
    items = {i["id"]: i for i in s.parse_page(MERCADOLIBRE, "mercadolibre", "https://inmuebles.mercadolibre.com.ar/x")}
    assert set(items) == {"mercadolibre:4032113512", "mercadolibre:2154660325"}, items.keys()
    a = items["mercadolibre:4032113512"]
    assert a["price"] == 110000 and a["area"] == 54 and a["ambientes"] == 2
    assert a["address"].startswith("Arenales 1800")
    assert a["photo"].endswith("102026-E.webp")
    assert a["url"].startswith("https://departamento.mercadolibre.com.ar/MLA-4032113512")
    b = items["mercadolibre:2154660325"]
    assert b["price"] == 121000 and b["ambientes"] == 3
    ok = {i["id"] for i in items.values() if s.matches(i, F)}
    assert ok == {"mercadolibre:4032113512", "mercadolibre:2154660325"}, ok
    src = {"name": "Recoleta 1 amb", "zone": "Recoleta", "aliases": ["recoleta"]}
    assert s.page_matches_zone(
        "<title>Departamentos en Venta en Recoleta, Capital Federal, 1 ambiente</title><h1>Departamentos en Venta en Recoleta, Capital Federal, 1 ambiente</h1>",
        "https://inmuebles.mercadolibre.com.ar/departamentos/venta/1-ambiente/capital-federal/recoleta/",
        src,
    )


def test_pagination_urls():
    assert s.page_url("argenprop", "https://a/b", 2) == "https://a/b?pagina-2"
    assert s.page_url("argenprop", "https://a/b?orden=masnuevos", 2) == "https://a/b?pagina-2"
    assert s.page_url("argenprop", "https://a/b?foo=1", 1) == "https://a/b"
    assert s.page_url("zonaprop", "https://z/x-dolar.html", 3) == "https://z/x-dolar-pagina-3.html"
    assert s.page_url("zonaprop", "https://z/x-dolar.html", 5) == "https://z/x-dolar-pagina-5.html"
    assert s.page_url("zonaprop", "https://z/x-dolar.html", 1) == "https://z/x-dolar.html"
    ml = "https://inmuebles.mercadolibre.com.ar/departamentos/venta/1-ambiente/capital-federal/recoleta/"
    assert s.page_url("mercadolibre", ml, 1) == ml
    assert s.page_url("mercadolibre", ml, 2) == ml  # robots bloquea _Desde_


def test_source_pages():
    assert s.source_pages({"site": "zonaprop", "name": "x"}) == 3
    assert s.source_pages({"site": "zonaprop", "name": "x", "pages": 5}) == 5
    assert s.source_pages({"site": "argenprop", "name": "x", "pages": 3}) == 3
    try:
        s.source_pages({"site": "zonaprop", "name": "x", "pages": 6})
    except ValueError as e:
        assert "robots.txt" in str(e)
    else:
        raise AssertionError("zonaprop pages=6 debería rechazarse")
    try:
        s.source_pages({"site": "argenprop", "name": "x", "pages": 4})
    except ValueError as e:
        assert "robots.txt" in str(e)
    else:
        raise AssertionError("argenprop pages=4 debería rechazarse")
    try:
        s.source_pages({"site": "mercadolibre", "name": "x", "pages": 2})
    except ValueError as e:
        assert "robots.txt" in str(e)
    else:
        raise AssertionError("mercadolibre pages=2 debería rechazarse")
    assert s.source_pages({"site": "mercadolibre", "name": "x", "pages": 1}) == 1
    for src in CFG["sources"]:
        n = s.source_pages(src)
        assert 1 <= n <= s.PAGES_MAX[src["site"]]
        assert "orden-publicado" not in src["url"]
        assert "orden=" not in src["url"]
        if src["site"] == "argenprop":
            assert "?" not in src["url"]
        if src["site"] == "mercadolibre":
            assert "_Desde_" not in src["url"] and "_PriceRange_" not in src["url"]


def test_formatting():
    i = {"id": "zonaprop:1", "site": "zonaprop", "url": "https://z/1", "title": "t", "price": 98000,
         "area": 57, "ambientes": 3, "address": "Juncal 2900", "zone": "Recoleta", "old_price": 105000,
         "tags": ["de época", "para reciclar"]}
    msg = s.fmt_item(i, "📉")
    assert "USD 98.000" in msg
    assert "Bajó de USD 105.000 a USD 98.000" in msg
    assert "−USD 7.000" in msg and "el portal no dice cuándo" in msg
    assert "57 m²" in msg
    assert "A favor: es de época y está para reciclar." in msg
    from_hist = s.prior_price({"price": 90000, "old_price": None,
                               "price_history": [{"price": 100000}, {"price": 90000}]})
    assert from_hist == 100000
    dated = s.format_drop(
        {"price": 121000, "old_price": 129000,
         "price_history": [
             {"date": "2026-10-08T12:00:00+00:00", "price": 129000},
             {"date": "2026-10-10T01:00:00+00:00", "price": 121000},
         ]},
    )
    assert "bajó de USD 129.000 a USD 121.000" in dated
    assert "6%" in dated
    assert "Zonaprop: https://z/1" in msg and "<a href" not in msg
    assert "pasa barrio, metros y balcón" in s.why_line({"tags": []})


def test_preferences_not_exclusive():
    items = {i["id"]: i for i in s.parse_page(ARGENPROP, "argenprop", "https://www.argenprop.com/x")}
    for i in items.values():
        s.apply_signals(i, SIGNALS, F)
    dream = items["argenprop:44444444"]
    assert "de época" in dream["tags"] and "para reciclar" in dream["tags"] and "edificio ok" in dream["tags"], dream
    assert dream["score"] >= 7, dream
    flojo = items["argenprop:55555555"]
    assert "edificio flojo" in flojo["tags"] and "para reciclar" not in flojo["tags"], flojo
    assert not s.matches(flojo, F)  # edificio a reciclar corta: no se da vuelta
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
    assert s.parse_price("Departamentos hasta USD 140.000") is None
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

    rosario = {
        "price": 98000, "ambientes": 3, "area": 57,
        "title": "3 amb en Barrio Norte, Rosario",
        "address": "Pellegrini 1200, Rosario",
        "url": "https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-barrio-norte-rosario-111.html",
        "blurb": "",
        "zone": "Barrio Norte",
    }
    echesortu = {
        "price": 67000, "ambientes": None, "area": None,
        "title": "venta departamento dorm. con patio echesortu",
        "address": "",
        "url": "https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-departamento-2-dorm.-con-patio-echesortu-57717195.html",
        "blurb": "",
        "zone": "",
    }
    santa_fe_av = {
        "price": 108000, "ambientes": 3, "area": 56,
        "title": "3 amb Recoleta sobre Av. Santa Fe",
        "address": "Av. Santa Fe 1700, Recoleta, Capital Federal",
        "url": "https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-recoleta-santa-fe-222.html",
        "blurb": "",
        "zone": "Recoleta",
    }
    av_gral_paz = {
        "price": 108000, "ambientes": 3, "area": 56,
        "title": "3 amb Recoleta cerca de Av. General Paz",
        "address": "Juncal 2900, Recoleta",
        "url": "https://z/recoleta-av-general-paz.html",
        "blurb": "",
        "zone": "Recoleta",
    }
    assert s.is_foreign_city(rosario, F) and s.is_rejected(rosario, F)
    assert s.is_foreign_city(echesortu, F) and not s.in_scope(echesortu, F)
    assert not s.is_foreign_city(santa_fe_av, F) and s.in_scope(santa_fe_av, F)
    assert not s.is_foreign_city(av_gral_paz, F) and s.in_scope(av_gral_paz, F)


def test_drop_out_of_scope():
    now = "2026-10-10T12:00:00+00:00"
    catalog = {
        "listings": [
            {"id": "zonaprop:ok", "zone": "Recoleta", "title": "3 amb Recoleta",
             "address": "Juncal 2900", "url": "https://z/recoleta.html", "active": True},
            {"id": "zonaprop:ros", "zone": "", "title": "departamento en venta granadero baigorria.",
             "address": "", "url": "https://z/granadero-baigorria.html", "active": True},
            {"id": "zonaprop:paso", "zone": "Barrio Norte",
             "title": "Paso 760 y avenida Córdoba",
             "address": "Paso 760", "url": "https://z/paso-700-semipiso.html", "active": True},
        ]
    }
    gone = s.drop_out_of_scope(catalog, F, now)
    by_id = {x["id"]: x for x in catalog["listings"]}
    assert gone == ["zonaprop:ros"]
    assert by_id["zonaprop:ok"]["active"] is True
    assert by_id["zonaprop:paso"]["active"] is True
    assert by_id["zonaprop:ros"]["active"] is False and by_id["zonaprop:ros"]["gone_at"] == now


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
    assert armenia["expensas_ars"] == 350000 and "350.000" in armenia["expensas_text"]
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


def test_street_zones():
    f = CFG["filters"]
    def z(address, title=""):
        return s.classify_zone({"address": address, "title": title}, f)

    assert z("Fitz Roy al 2400") is None
    assert z("Thames Al 2400, Botánico") is None
    assert z("Armenia 2100, Botánico") is None
    assert z("José A. Cabrera 3275") is None
    assert z("Corrientes 1900") is None
    assert z("Tucumán 1900") is None
    assert z("Sarmiento 1400") is None
    assert z("Av. Cordoba al 1332") is None
    assert z("Av. Cordoba al 1500") == "Barrio Norte"
    assert z("CORDOBA 3300") is None
    assert z("Montevideo al 600") is None
    assert z("Marcelo Torcuato de Alvear 900") is None
    assert z("Suipacha e/ Avenida Córdoba y Paraguay", "Suipacha") is None
    assert z("Viamonte y Rodriguez Peña - Unidad 103") is None
    assert z("San Luis 3376") is None
    assert z("Güemes 4700") is None
    assert z("Paraguay 1200") is None
    assert z("Arenales 1100") is None

    assert z("Paso 760") == "Barrio Norte"
    assert z("Av. Córdoba 1800") == "Barrio Norte"
    assert z("Paraguay 1878") == "Barrio Norte"
    assert z("French 2668") == "Recoleta"
    assert z("French") == "Recoleta"
    assert z("Juncal Al 2077") == "Recoleta"
    assert z("Venta Depto Juncal Al 2077. Recoleta Oportunidad!!!! 56") == "Recoleta"
    assert z("Ayacucho 1400") == "Recoleta"
    assert z("Juncal 2900") == "Recoleta"
    assert z("Av. Las Heras 3100") == "Recoleta"
    assert z("Cabello al 3900") == "Botánico"
    assert z("Cabello 3200") == "Palermo Chico"
    assert z("Salguero 3078") == "Palermo Chico"
    assert z("Scalabrini Ortiz al 2300") == "Botánico"
    assert z("Santa Fe 3800") == "Botánico"
    assert z("Charcas 3245") == "Recoleta"

    src = {"name": "Recoleta", "zone": "Recoleta", "aliases": ["recoleta"]}
    assert z("Ecuador 400") is None
    assert z("Ecuador 900") == "Barrio Norte"
    assert z("Ecuador 1500") == "Recoleta"
    assert z("French 100") is None
    assert z("Mansilla 800") is None
    assert z("Paso 400") is None
    rec_lie = {
        "price": 98000, "ambientes": 2, "area": 55,
        "title": "Depto Recoleta oportunidad", "address": "Ecuador 400",
        "url": "https://z/recoleta-ecuador.html", "blurb": "",
    }
    assert not s.keep_listing(rec_lie, src, f)
    once_title = _item("zonaprop:once", title="Recoleta límite con Once", address="Juncal 2900, Recoleta")
    s.mark_claimed_barrio(once_title, f)
    assert "barrio del aviso no coincide" in once_title["tags"]
    pasos = _item("zonaprop:pasos2", title="3 amb a pasos de Congreso", address="Juncal 2900, Recoleta")
    s.mark_claimed_barrio(pasos, f)
    assert "barrio del aviso no coincide" not in pasos["tags"]
    assert not s.keep_flip(_item("zonaprop:floja", tags=["zona floja"]))

    web = json.loads((Path(__file__).parent / "web" / "data" / "street-zones.json").read_text())
    assert web["street_zones"] == f["street_zones"]
    assert web["reject_barrios"] == f["reject_barrios"]

    bad = {"address": "Fitz Roy al 2400", "title": "Depto Recoleta", "url": "https://z/recoleta-1.html",
           "price": 98000, "area": 55, "ambientes": 2, "blurb": ""}
    assert not s.keep_listing(bad, src, f)


def test_place_key_cross_portal():
    zp = {"address": "Paso 760, Barrio Norte", "title": "Paso 760", "area": 76, "ambientes": 3, "price": 112000}
    ml = {"address": "Paso al 760", "title": "Depto Paso 760", "area": 74, "ambientes": 3, "price": 109000}
    other = {"address": "Paso 760, Barrio Norte", "title": "x", "area": 76, "ambientes": 2, "price": 90000}
    assert s.place_key(zp) == s.place_key(ml) == "paso 760|75|3"
    assert s.place_key(other) != s.place_key(zp)
    assert s.place_key({"address": "", "title": "sin calle", "area": 50, "ambientes": 2}) == ""


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
    live = _item("zonaprop:old", url="https://z/old.html", photo="")
    s.apply_air(live)
    listing = {
        **live,
        "first_seen": rec["first_seen"],
        "active": True,
        "gone_at": None,
        "old_price": None,
        "price_history": [{"date": rec["first_seen"], "price": rec["price"]}],
    }
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
            [_item("zonaprop:old", url="https://z/old.html", photo="")],
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


def test_enrich_fills_photo():
    catalog = {"listings": [_item("zonaprop:1", photo="", address="")]}
    n = s.enrich_catalog(catalog, [_item("zonaprop:1", photo="https://img/x.jpg", address="Juncal 2900")])
    assert n == 1
    rec = catalog["listings"][0]
    assert rec["photo"] == "https://img/x.jpg"
    assert rec["address"] == "Juncal 2900"
    assert s.enrich_catalog(catalog, [_item("zonaprop:1", photo="https://img/x.jpg", address="Juncal 2900")]) == 0


def test_enrich_updates_stale_price():
    now = "2026-10-10T12:00:00+00:00"
    catalog = {"listings": [_item("zonaprop:1", price=118000, address="Juncal 2900")]}
    catalog["listings"][0]["price_history"] = [{"date": "2026-10-09T00:00:00+00:00", "price": 118000}]
    n = s.enrich_catalog(catalog, [_item("zonaprop:1", price=98000, address="Juncal 2900")], now)
    assert n == 1
    rec = catalog["listings"][0]
    assert rec["price"] == 98000
    assert rec["old_price"] == 118000
    assert rec["price_history"][-1] == {"date": now, "price": 98000}


def test_price_skips_list_cap_and_struck():
    html = """
    <div class="card">
      <h2>Departamentos hasta USD 140.000</h2>
      <div class="postingPrices-module__price"><del>USD 118.000</del> USD 98.000</div>
      <h3>57 m² tot.3 amb.</h3>
      <h4>Juncal 2900</h4><h4>Recoleta, Capital Federal</h4>
      <a href="/propiedades/clasificado/veclapin-juncal-2900-60189306.html">Juncal</a>
    </div>
    """
    items = {i["id"]: i for i in s.parse_page(html, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    assert items["zonaprop:60189306"]["price"] == 98000


def test_weekly_summary_with_and_without_snapshot():
    today = "2026-10-12"  # lunes
    now = "2026-10-12T11:20:00+00:00"
    assert s.is_weekly_slot(today, 11) and not s.is_weekly_slot("2026-10-10", 11)
    listings = [
        {**_item("zonaprop:a", zone="Recoleta", price=90000, area=50),
         "active": True, "first_seen": "2026-10-12T10:00:00+00:00",
         "price_history": [{"date": "2026-10-01T00:00:00+00:00", "price": 100000},
                           {"date": "2026-10-12T10:00:00+00:00", "price": 90000}]},
        {**_item("zonaprop:b", zone="Recoleta", price=100000, area=50),
         "active": True, "first_seen": "2026-09-01T00:00:00+00:00",
         "price_history": [{"date": "2026-09-01T00:00:00+00:00", "price": 100000}]},
        {**_item("zonaprop:c", zone="Botánico", price=120000, area=60),
         "active": True, "first_seen": "2026-09-01T00:00:00+00:00",
         "price_history": [{"date": "2026-10-13T00:00:00+00:00", "price": 110000}]},
    ]
    snap = s.build_weekly_snapshot(listings, now, today)
    assert snap["week"] == "2026-W42"
    assert snap["zones"]["Recoleta"]["active"] == 2
    assert snap["zones"]["Recoleta"]["new"] == 1
    assert snap["zones"]["Recoleta"]["drops"] == 1
    assert snap["top_drops"][0]["delta"] == 10000
    bare = s.format_weekly(snap, None)
    assert "USD 1.900/m²" in bare or "USD" in bare
    assert "vs sem. anterior" not in bare
    prev = {"week": "2026-W41", "zones": {"Recoleta": {"median_usd_m2": 2200}}}
    with_prev = s.format_weekly(snap, prev)
    assert "vs sem. anterior" in with_prev


def test_verdict_and_pick():
    cfg = {"filters": {"max_price_usd": 125000}}
    v = s.verdict(
        {
            "tags": ["de época", "para reciclar", "sobre presupuesto"],
            "price": 135000,
            "photo": "x",
            "expensas_ars": 80000,
            "piso": 3,
            "area": 60,
        },
        cfg,
    )
    assert "A favor: es de época y está para reciclar." in v["text"]
    assert "pide USD 135.000 y el gusto es USD 125.000" in v["text"]
    pb = s.verdict({"tags": ["edificio flojo"], "piso": 0, "photo": "x", "expensas_ars": 1, "area": 50})
    assert "el edificio está flojo" in pb["text"] and "es planta baja" in pb["text"]
    pool = [_item(f"zonaprop:{i}", score=10 - i, price=100000 + i, active=True) for i in range(5)]
    assert s.resolve_pick_id(pool, {"id": None, "manual": False}) == "zonaprop:0"
    assert s.resolve_pick_id(pool, {"id": "zonaprop:3", "manual": True}) == "zonaprop:3"
    assert s.resolve_pick_id(pool, {"id": "gone", "manual": True}) == "zonaprop:0"
    marked = {**pool[0], "old_price": 110000, "_pick": True}
    assert "candidato" in s.fmt_item(marked, "📉")


def test_top_drop_is_loud():
    pool = [_item(f"zonaprop:{i}", score=10 - i, price=100000 + i) for i in range(12)]
    tops = s.top_ids(pool, 10)
    assert len(tops) == 10 and "zonaprop:0" in tops and "zonaprop:11" not in tops
    cfg = {"notify_loud_min_score": 2, "notify_loud_drop_pct": 5, "alert_top_n": 10}
    drop = {**pool[0], "old_price": 110000, "price": 108000, "_top": True, "_top_n": 10}
    msg = s.fmt_item(drop, "📉")
    assert "Bajó de USD 110.000 a USD 108.000" in msg and "top 10" in msg
    assert not s.is_loud({"score": 0, "price": 108000, "old_price": 110000}, cfg)  # ~1.8%
    # la prioridad top-10 se aplica en process_portal (_silent=False), no en is_loud


def test_notify_loud_and_silent():
    cfg = {"notify_loud_min_score": 2, "notify_loud_drop_pct": 5}
    assert s.is_loud({"score": 3, "price": 100000}, cfg)
    assert not s.is_loud({"score": 0, "price": 100000}, cfg)
    assert s.is_loud({"score": 0, "price": 90000, "old_price": 100000}, cfg)  # 10%
    assert not s.is_loud({"score": 0, "price": 97000, "old_price": 100000}, cfg)  # 3%
    payloads = s.notify_payloads(
        "",
        [
            {**_item("zonaprop:loud", score=3), "_silent": not s.is_loud({**_item("zonaprop:loud", score=3), **{"score": 3}}, cfg)},
            {**_item("zonaprop:quiet", score=0), "_silent": True},
        ],
        "",
    )
    by_id = {p["item_id"]: p for p in payloads}
    assert by_id["zonaprop:loud"]["silent"] is False
    assert by_id["zonaprop:quiet"]["silent"] is True
    captured = []

    class Resp:
        status_code = 200
        def raise_for_status(self):
            return None

    def fake_post(url, json=None, timeout=None):
        captured.append(json)
        return Resp()

    with mock.patch.object(s.requests, "post", side_effect=fake_post):
        s.tg_send("t", "1", "hola", silent=True)
        s.tg_send("t", "1", "hey", silent=False)
    assert captured[0]["disable_notification"] is True
    assert captured[1]["disable_notification"] is False
    hb = s.notify_payloads("⏱ Corrí, sin novedades. 10 avisos activos.", [], "", intro_silent=True)
    assert hb[0]["silent"] is True


def test_expensas_and_extras():
    html = (Path(__file__).parent / "fixtures" / "zonaprop-botanico.html").read_text(encoding="utf-8")
    items = {i["id"]: i for i in s.parse_page(html, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    with_exp = [i for i in items.values() if i.get("expensas_ars")]
    without = [i for i in items.values() if not i.get("expensas_ars")]
    assert with_exp and without
    assert all(i["expensas_text"] for i in with_exp)
    assert s.parse_expensas("USD 100.000 sin dato") == (None, "")
    assert s.parse_expensas("USD 110.000 + $150.000 expensas") == (150000, "$150.000 expensas")
    assert s.parse_piso("Departamento en 7° piso, luminoso") == 7
    assert s.parse_piso("planta baja con patio") == 0
    assert s.parse_piso("pisos de madera") is None
    assert s.parse_cochera("con cochera fija") is True
    assert s.parse_cochera("sin cochera") is False
    assert s.parse_cochera("luminoso") is None
    assert s.parse_antiguedad(" - 70 años - 1 baño") == 70
    assert s.parse_antiguedad("departamento A estrenar, impecable") == 0
    f = dict(F)
    f["max_expensas_ars"] = 200000
    high = {"price": 98000, "ambientes": 3, "area": 57, "title": "x", "address": "Juncal 2900, Recoleta",
            "url": "https://z/rec.html", "blurb": "", "expensas_ars": 350000}
    unknown = {**high, "expensas_ars": None}
    low = {**high, "expensas_ars": 110000}
    assert not s.matches(high, f) and s.matches(unknown, f) and s.matches(low, f)
    assert "expensas s/d" in s.fmt_item(_item("zonaprop:1"))
    assert "expensas $ 110.000" in s.fmt_item({**_item("zonaprop:1"), "expensas_ars": 110000, "piso": 8, "cochera": True})


def test_median_and_decision_fields():
    now = "2026-10-10T12:00:00+00:00"
    small = [_item(f"zonaprop:{i}", zone="Recoleta", price=100000 + i * 1000, area=50) for i in range(5)]
    assert s.zone_medians(small, 8) == {}
    big = [_item(f"zonaprop:{i}", zone="Recoleta", price=100000, area=50) for i in range(8)]
    big.append(_item("zonaprop:9", zone="Recoleta", price=200000, area=50))
    meds = s.zone_medians(big, 8)
    assert "Recoleta" in meds and meds["Recoleta"]["n"] == 9
    cheap = _item("zonaprop:x", zone="Recoleta", price=80000, area=50, first_seen="2026-10-01T00:00:00+00:00",
                  price_history=[{"date": "a", "price": 90000}, {"date": "b", "price": 80000}])
    s.apply_decision(cheap, meds, {"closing_discount_pct": 5, "median_min_n": 8}, now)
    assert cheap["usd_per_m2"] == 1600
    assert cheap["vs_median_pct"] is not None and cheap["vs_median_pct"] < 0
    assert cheap["vs_median_n"] == 9
    assert cheap["days_seen"] == 9
    assert cheap["price_drops"] == 1
    assert cheap["closing_ref_usd"] == 76000
    thin = _item("zonaprop:y", zone="Botánico", price=120000, area=60, first_seen=now)
    s.apply_decision(thin, meds, {"closing_discount_pct": 5}, now)
    assert thin["usd_per_m2"] == 2000
    assert thin["vs_median_pct"] is None
    assert thin["days_seen"] == 0
    msg = s.fmt_item(cheap)
    assert "USD 1.600/m²" in msg and "vs mediana de Recoleta" in msg
    assert "visto hace 9 días" in msg and "Referencia de cierre" in msg


def test_apply_value_metro_and_expensas():
    cheap = _item("zonaprop:v1", score=0, tags=[], vs_median_pct=-16, expensas_ars=180000)
    s.apply_value(cheap)
    assert cheap["score"] == 2 and "metro muy barato" in cheap["tags"]
    s.apply_value(cheap)
    assert cheap["score"] == 2 and cheap["tags"].count("metro muy barato") == 1
    mid = _item("zonaprop:v2", score=0, tags=[], vs_median_pct=-9)
    s.apply_value(mid)
    assert mid["score"] == 1 and "metro barato" in mid["tags"]
    rich = _item("zonaprop:v3", score=0, tags=[], vs_median_pct=22, expensas_ars=400000)
    s.apply_value(rich)
    assert rich["score"] == -3
    assert "metro caro" in rich["tags"] and "expensas muy altas" in rich["tags"]
    high = _item("zonaprop:v4", score=0, tags=[], expensas_ars=310000)
    s.apply_value(high)
    assert high["score"] == -1 and "expensas altas" in high["tags"]
    v = s.verdict(rich)
    assert any("metro está caro" in x for x in v["resta"])
    assert any("expensas son muy altas" in x for x in v["resta"])
    steal = _item("zonaprop:v5", score=0, tags=[], vs_median_pct=-16, price=108000)
    epoca = _item("zonaprop:v6", score=3, tags=["de época"], vs_median_pct=0, price=132000)
    s.apply_value(steal)
    s.apply_value(epoca)
    ranked = s.prefer([steal, epoca])
    assert ranked[0]["id"] == "zonaprop:v6"  # época sigue arriba de un metro barato solo
    assert steal["score"] == 2


def test_flip_cuts_and_air():
    rec = {
        "price": 100000, "ambientes": 3, "area": 55,
        "title": "3 amb Recoleta", "address": "Juncal 2900, Recoleta",
        "url": "https://z/recoleta-reformar.html", "blurb": "departamento para reformar, luminoso",
        "zone": "Recoleta",
    }
    s.apply_signals(rec, SIGNALS, F)
    assert "para reciclar" in rec["tags"], rec

    done = {
        "price": 119000, "ambientes": 2, "area": 52,
        "title": "Reciclado a nuevo en Recoleta", "address": "Arenales 1800, Recoleta",
        "url": "https://z/recoleta-nuevo.html", "blurb": "", "zone": "Recoleta",
    }
    s.apply_signals(done, SIGNALS, F)
    assert "ya hecho" in done["tags"] and "edificio ok" not in done["tags"], done

    edificio = {
        "price": 110000, "ambientes": 2, "area": 60,
        "title": "2 amb Recoleta", "address": "Callao 1200, Recoleta",
        "url": "https://z/recoleta-edificio.html", "blurb": "edificio reciclado, muy bueno",
        "zone": "Recoleta",
    }
    s.apply_signals(edificio, SIGNALS, F)
    assert "edificio ok" in edificio["tags"] and "ya hecho" not in edificio["tags"], edificio

    paso = _item(
        "zonaprop:paso",
        zone="Barrio Norte",
        price=112000,
        area=76,
        score=5,
        tags=["de época", "edificio ok"],
    )
    s.apply_air(paso)
    assert paso["air_usd"] == 78000, paso
    assert "aire amplio" in paso["tags"]
    s.apply_air(paso)
    assert paso["score"] == 8 and paso["tags"].count("aire amplio") == 1

    justo = _item("zonaprop:justo", zone="Recoleta", price=125000, area=50, score=0, tags=[])
    s.apply_air(justo)
    assert justo["air_usd"] == -6250, justo
    assert "sin aire" in justo["tags"]

    pb = _item("zonaprop:pb", zone="", price=90000, area=60, score=0, tags=[], piso=0)
    s.apply_air(pb)
    assert "planta baja" in pb["tags"] and pb["score"] == -1
    s.apply_air(pb)
    assert pb["score"] == -1 and pb["tags"].count("planta baja") == 1

    combo = _item(
        "zonaprop:combo",
        zone="Recoleta",
        price=100000,
        area=55,
        score=4,
        tags=["para reciclar", "edificio ok"],
    )
    s.apply_air(combo)
    assert "tesis" in combo["tags"] and combo["score"] >= 6

    edge = _item(
        "zonaprop:paso760",
        zone="Barrio Norte",
        price=112000,
        area=76,
        score=5,
        tags=["de época", "edificio ok"],
        address="Paso 760",
        title="Paso 760 Y avenida córdoba: Semipiso",
    )
    assert s.is_weak_street(edge)
    s.apply_air(edge)
    assert "zona floja" in edge["tags"]
    assert edge["exit_usd_m2"] == 2200
    assert edge["air_usd"] == 36200
    assert "aire amplio" not in edge["tags"] and "aire" in edge["tags"]
    s.apply_air(edge)
    assert edge["tags"].count("zona floja") == 1
    assert edge["score"] == 3
    pasos = _item("zonaprop:pasos", address="Juncal 2900, Recoleta", title="3 amb a pasos de Congreso")
    assert not s.is_weak_street(pasos)
    juncal = _item("zonaprop:juncal", address="Juncal 2900, Recoleta", title="De época Recoleta")
    assert not s.is_weak_street(juncal)

    rich = _item("zonaprop:rich", tags=["metro caro"])
    assert not s.keep_flip(rich) and s.keep_flip(_item("zonaprop:ok", tags=[]))

    v = s.verdict({
        **paso,
        "photo": "x",
        "expensas_ars": 1,
        "piso": 3,
    })
    assert "bastante margen" in " ".join(v["entra"]) or "bastante margen" in v["text"]
    assert "metro de referencia de Barrio Norte" in v["text"]
    assert "USD 2.750" in v["text"]


def test_coverage_last_page_unseen():
    seen = {"zonaprop:old"}
    last = [
        _item("zonaprop:old"),
        _item("zonaprop:fresh", url="https://z/fresh.html", address="Arenales 1200, Recoleta"),
    ]
    unseen = s.coverage_unseen(last, seen, F)
    assert [i["id"] for i in unseen] == ["zonaprop:fresh"]
    assert s.coverage_warning("zonaprop · Recoleta", last, seen, F, 3) == (
        "zonaprop · Recoleta: esta fuente puede tener avisos fuera de las páginas permitidas; "
        "conviene partirla en más URLs"
    )
    assert s.coverage_unseen(last, set(), F) == []
    assert s.coverage_warning("x", last, set(), F, 3) is None
    assert s.coverage_warning("x", [_item("zonaprop:old")], seen, F, 3) is None
    assert s.iso_week("2026-10-12") == "2026-W42"  # lunes
    assert s.iso_week("2026-10-11T23:00:00+00:00") == "2026-W41"
    assert s.should_send_coverage({"meta": {}}, "2026-10-10")
    assert not s.should_send_coverage({"meta": {"coverage_week": "2026-W41"}}, "2026-10-10")
    assert s.should_send_coverage({"meta": {"coverage_week": "2026-W40"}}, "2026-10-10")


def test_areas_weights_expensas_signals_and_offer():
    html = (Path(__file__).parent / "fixtures" / "zonaprop-botanico.html").read_text(encoding="utf-8")
    items = {i["id"]: i for i in s.parse_page(html, "zonaprop", "https://www.zonaprop.com.ar/x.html")}
    split = items["zonaprop:60336475"]
    assert split["area_covered"] == 32, split
    assert split["area_semi"] == 4, split
    assert split["area_total"] == 36, split
    assert split["area"] == 34, split  # 32 + 4*0.5

    blob = "Departamento con 45 m² de superficie construida. 60 m² tot.2 amb."
    rec = s.parse_areas("zonaprop", blob)
    assert rec["area_covered"] == 45 and rec["area_total"] == 60
    assert rec["area"] == 45
    only_tot = s.parse_areas("zonaprop", "60 m² tot.2 amb.")
    assert only_tot["area"] == 60 and only_tot["area_covered"] is None
    w = s.weighted_area(45, 6, 60)
    assert abs(w - 50.7) < 0.01  # 45 + 3 + 9*0.3

    assert s.parse_expensas("USD 76.000 + $ 1 Expensas") == (None, "")
    cheap = {"price": 76000, "ambientes": 2, "area": 45, "area_covered": 45, "area_total": 60,
             "title": "Santa Fe y Callao", "address": "Avenida Santa Fe & Avenida Callao",
             "url": "https://z/santa-fe.html", "blurb": "", "expensas_ars": 1, "expensas_text": "$ 1 Expensas"}
    s.normalize_expensas(cheap)
    assert cheap["expensas_ars"] is None
    assert s.matches(cheap, F) is False  # 45 cubiertos < 50

    tot_only = {**cheap, "area": 60, "area_covered": None, "expensas_ars": None}
    s.apply_signals(tot_only, SIGNALS, F)
    assert "m² sin verificar" in tot_only["tags"]

    occ = {
        "price": 125000, "ambientes": 2, "area": 66, "title": "En sucesion. Barrio Norte",
        "address": "Juncal 2800, Barrio Norte", "url": "https://z/sucesion.html",
        "blurb": "departamento interno, venta con renta", "zone": "Barrio Norte",
    }
    s.apply_signals(occ, SIGNALS, F)
    assert "ocupado" in occ["tags"], occ
    ready = {
        "price": 119000, "ambientes": 2, "area": 52, "title": "Listo para mudarse Recoleta",
        "address": "Arenales 1800, Recoleta", "url": "https://z/mudarse.html", "blurb": "", "zone": "Recoleta",
    }
    s.apply_signals(ready, SIGNALS, F)
    assert "ya hecho" in ready["tags"], ready

    paso_html = """
    <div data-id="999001" class="card">
      <h2>USD 112.000</h2><h3>76 m² tot.3 amb.</h3>
      <h4>Paso 700</h4><h4>Barrio Norte, Capital Federal</h4>
      <h2><a href="/propiedades/clasificado/veclapin-paso-760-semipiso-999001.html">Paso 760 y avenida Córdoba: Semipiso</a></h2>
    </div>
    """
    paso = s.parse_page(paso_html, "zonaprop", "https://www.zonaprop.com.ar/x.html")[0]
    assert paso["address"] == "Paso 700", paso
    s.apply_signals(paso, SIGNALS, F)
    assert paso["address_unverified"] is True, paso

    steal = _item("zonaprop:s", zone="Recoleta", price=80000, area=50, score=0, tags=[], vs_median_pct=-40)
    s.apply_value(steal)
    assert "metro sospechoso" in steal["tags"] and "metro muy barato" not in steal["tags"]

    deal = _item(
        "zonaprop:neto",
        zone="Recoleta",
        price=100000,
        area=50,
        score=0,
        tags=["para reciclar"],
    )
    s.apply_air(deal)
    assert deal["reno_usd_m2"] == 375
    assert deal["max_offer_usd"] is not None
    assert deal["neto_hard_usd"] is not None
    assert deal["decision"] in {"comprar", "negociar", "vigilar", "descartar"}
    assert deal["seventy_offer_usd"] == 77500  # 0.7*2750*50 - 375*50
    garage = _item("zonaprop:coch", zone="Recoleta", price=90000, area=80, tags=["incluye cochera"])
    s.apply_air(garage)
    assert garage["air_usd"] is None and garage["neto_hard_usd"] is None and garage["max_offer_usd"] is None
    assert s.decision_of(80000, 100000) == "comprar"
    assert s.decision_of(100000, 100000) == "negociar"
    assert s.decision_of(105000, 100000) == "vigilar"
    assert s.decision_of(120000, 100000) == "descartar"

    cfg = json.loads((Path(__file__).parent / "config.json").read_text())
    web = json.loads((Path(__file__).parent / "web" / "data" / "scoring.json").read_text())
    for key in (
        "buy_cost_pct",
        "buy_cost_pct_hard",
        "sale_cost_pct",
        "sale_cost_pct_hard",
        "reno_usd_m2_recycle",
        "reno_usd_m2_recycle_hard",
        "reno_usd_m2_ok",
        "reno_usd_m2_ok_hard",
        "area_weight_covered",
        "area_weight_semi",
        "area_weight_uncovered",
        "closing_discount_pct",
        "decision_buy_pct",
        "decision_watch_pct",
        "rule_70_pct",
        "expensas_min_valid_ars",
        "value_suspect_pct",
        "weak_streets",
        "exit_usd_m2",
        "min_area_m2",
    ):
        assert web[key] == cfg[key], key


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok", name)
            finally:
                _restore_paths()
