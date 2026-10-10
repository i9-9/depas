"""Pruebas offline con HTML sintético que imita la estructura de Argenprop y Zonaprop."""
import json
from pathlib import Path

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
   <img src="x.jpg"><h2>USD 115.000</h2><h3>50 m² tot.2 amb.1 dorm.1 baño</h3>
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
    assert "de época" in msg and "para reciclar" in msg


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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
