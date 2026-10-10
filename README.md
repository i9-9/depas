# Buscador de departamentos (Zonaprop + Argenprop + Mercado Libre → Telegram + web)

Corre en GitHub Actions (gratis), 5 veces por día, y te manda por Telegram los avisos **nuevos** (y las bajas de precio) que cumplan tus filtros. Cada aviso dice *por qué* entró y, si la card trae foto, la manda. Los mismos avisos se publican en una web estática (Vercel, plan gratis) que se actualiza cuando el Action commitea datos nuevos.

Filtros actuales (`config.json`): venta · con balcón · Recoleta, Barrio Norte, Botánico, Palermo Chico · hasta 3 ambientes · mínimo 50 m² · precio entre USD 20.000 y 140.000 (gusto 125.000).

Criterio (flip: buen edificio, unidad a reciclar, plata neta):

- **Corta** (si no entra, no avisa): **cuadra linda** (la calle y la altura mandan; el barrio del aviso no. Ecuador 400 no es Barrio Norte aunque la card lo diga. Sin calle+altura no entra. Once/Abasto/Congreso en el título, o cuadra floja, tampoco), **balcón**, ambientes, **m² de deal** (cubiertos si están; sin metros no hay deal; el mínimo 50 m² usa cubiertos/ponderados, no el total inflado), techo de precio, expensas ≥ $380.000 si la card las trae, y **zona**. Tiene que nombrar Recoleta / Barrio Norte / Botánico / Palermo Chico. Se descartan pozo y cuotas, **edificio a reciclar / mal estado / a demoler**, otros barrios (`reject_barrios`: Tigre, Once, Congreso, etc., solo dirección/URL) y otras ciudades (`reject_cities`). Después de las medianas se corta también el **metro caro** (≥+20% vs este pool). Av. Santa Fe y Av. General Paz en CABA no se tocan. `$ 1 Expensas` se trata como dato faltante.
- **Ordena** por **neto duro** (obra, entrada, salida y hold). El **aire** desempata. Tiers: Mejor ≥ USD 15.000 neto duro, Bien ≥ 0, Ok ≥ −25.000, Flojo el resto. La etiqueta **comprar / negociar / vigilar / descartar** compara el precio con la oferta máxima.
- **Suma** (etiqueta): de época, “para reciclar” / modernizar en la card, edificio en buen estado, aire, y el combo edificio+unidad. Resta: unidad ya hecha / listo para mudarse, planta baja, metro/expensas altos, **metro sospechoso** (≤ −30% vs la mediana del pool: verificar la cuadra, no es plus), sin aire, **ocupado** (inquilino, sucesión, COTI, interno), **incluye cochera** (sale de medianas y del aire; no restamos USD de cochera porque no hay número verificado), y **cuadra floja** (`weak_streets`: hoy Paso / Jean Jaurès). Esas calles usan una salida más baja. 125k es el gusto; un poco más entra con `sobre presupuesto`.
- **m²**: si la card desglosa, Mudafy (cubierto 100%, semi 50%, descubierto 30%). Si solo hay total, se etiqueta `m² sin verificar`. En Zonaprop a veces el título trae “superficie construida” y se usa como cubierto.
- **Salida**: metro fijo por barrio (Recoleta/BN 2750, Botánico 3000, Palermo Chico 3600). No hay ventas públicas en Argentina; no es un comparable de la cuadra. Lo “interno”, la orientación y el ruido no se parsean: van en la nota de visita.
- **Un aviso por depto** dentro del mismo portal: si el mismo (calle + altura + precio + m²) sale en Recoleta y Barrio Norte, queda uno. Si no hay dirección con número, no se agrupa.

## Setup (una sola vez, ~15 minutos)

1. **Crear el bot**: en Telegram hablá con `@BotFather` → `/newbot` → copiá el **token**.
2. **Obtener tu chat ID**: mandale cualquier mensaje a tu bot nuevo y abrí
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → copiá `"chat":{"id": ...}`.
3. **Crear el repo en GitHub**: nuevo repo **privado** (cuenta `i9-9`) y subí esta carpeta.
   Privado = no expone tu búsqueda, y las ~150 corridas por mes entran de sobra en los minutos gratis.
4. **Cargar los secrets**: Settings → Secrets and variables → Actions → New repository secret:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
5. **Primera corrida**: pestaña Actions → "Buscar departamentos" → Run workflow.
   Te llega un resumen con los avisos actuales de ese portal (los marca como vistos) y de ahí en más solo los nuevos.

Horarios (hora Argentina): 08:17, 11:17, 14:17, 17:17, 20:17. Se cambian en `.github/workflows/buscar.yml` (el cron está en UTC).

## Web en Vercel (plan gratis, repo privado)

La web vive en `web/`: Next.js estático, sin backend. Lee `web/data/listings-*.json` en el build.

1. En [Vercel](https://vercel.com) → Add New → Project → importá el repo **privado**.
2. Root Directory = `web`.
3. Framework Preset = Next.js. El resto (build `next build`, output estático) se detecta solo.
4. Deploy. Copiá la URL (ej. `https://depas.vercel.app`).
5. En GitHub: Settings → Secrets and variables → Actions → pestaña **Variables** → New repository variable:
   - `SITE_URL` = esa URL (sin slash final).
6. Cada push a `web/data/` (cuando hay aviso nuevo, baja de precio o dado de baja) redeploya solo. Si una corrida no cambió nada, no hay commit ni deploy.

La web es `noindex`. La home es **un candidato** (el primero del ranking por neto duro, o el `id` de `web/data/pick.json` si `manual` es true). El resto vive en `/archivo/`, en tiers de neto duro (Mejor → Bien → Ok → Flojo). Cada ficha muestra oferta máxima y un pad de visita que queda en ese dispositivo. Guardar / descartar también es local. Si Argenprop está vacío o un portal no actualiza, la home lo dice.
Las fotos salen de la card del listado. Si un aviso se cargó sin foto (migración vieja), la próxima corrida que lo vea completa la ficha.
Para fijar el candidato a mano: `{ "id": "zonaprop:…", "manual": true, "note": "lo vimos el sábado" }` en `web/data/pick.json`.

## Cambiar filtros

Editá `config.json`: `max_price_usd` (gusto), `max_price_usd_hard` (corte), `min_area_m2`, `max_ambientes`, `max_expensas_ars` (null = sin tope; sin dato de expensas el aviso entra), y la lista `sources`. Cada fuente tiene `pages` (default 3). El tope lo marca robots.txt: Zonaprop 5, Argenprop 3, Mercado Libre 1 (`/*_Desde_` está bloqueado). El código rechaza un valor más alto. Si un barrio satura esas páginas, no se sube el tope: se parte en más URLs (ambientes o tramo de precio), cada una con su `zone` (el barrio, para medianas y dados de baja).
`include_unknown_area: false`: sin m² no entra. `max_expensas_ars: 380000` corta expensas disparadas; sin dato de expensas el aviso igual entra.
Las preferencias (época, reciclar, edificio, ya hecho, ocupado) están en `signals`. Reciclar mira título y texto de la card. Los knobs de plata viven en `config.json` y se copian a `web/data/scoring.json`: obra intermedia 375 / integral 550, leve 250 / 300, entrada 5–8%, salida 5–6%, closing 3,9 (Mudafy oct 2026). El resto de números nuevos es supuesto, no verificado. `días` es desde que el buscador lo vio, no el “publicado hace” del portal.
`heartbeat: false` (default): si lo prendes, la primera corrida del día (08:17 ART / 11 UTC) avisa por Telegram, siempre silencioso, cuando no hubo novedades, con la cantidad de avisos activos.
`notify_loud_min_score` (3) y `notify_loud_drop_pct` (5): por debajo, Telegram manda el aviso con `disable_notification` (sin sonido). Época u otra señal fuerte, o una baja de al menos ese %, suenan. Un metro barato solo no alcanza para pitar.
`alert_top_n` (10): si baja el precio de uno de los N primeros del ranking (score, después precio), Telegram avisa **con sonido** y etiqueta `top 10`. `0` apaga solo esa prioridad; el resto de bajas sigue llegando.
**“Bajó” no lo marca el portal.** Guardamos el USD de la **card del listado** (no entramos al aviso) y, en la corrida siguiente, si el número cambió, actualizamos ficha e historial. Si la card trae precio tachado o “hasta USD 140.000” del filtro, se ignora. El portal puede mostrar otro número en la ficha interna; el nuestro es el de la card.
`closing_discount_pct` (5) y `closing_discount_source` alimentan la “referencia de cierre” (no es tasación; promedio CABA). La mediana de USD/m² se calcula sobre tus avisos activos del mismo barrio y solo se muestra si hay al menos `median_min_n` (8).

## Cosas a tener en cuenta

- **Argenprop desde Actions**: no se puede. GitHub Actions sale por IPs de datacenter; Argenprop (AWS WAF) las bloquea con 405/challenge. No hay setting de Actions que cambie eso, y no usamos proxies. El workflow **salta Argenprop** y no toca sus archivos. Zonaprop y Mercado Libre siguen en Actions. Argenprop se corre en **esta Mac** (IP residencial): launchd o `./scripts/buscar-argenprop-local.sh`.
- **Estado separado**: `state/seen-zonaprop.json` + `web/data/listings-zonaprop.json` y lo mismo para Mercado Libre los escribe Actions. `state/seen-argenprop.json` + `web/data/listings-argenprop.json` los escribe la Mac. Así no se pisan.
- **Commit solo si cambió algo**: aviso nuevo, baja de precio, aviso dado de baja, warning de cobertura (máx. semanal) o el resumen semanal (`state/weekly.json`, los lunes). Una corrida sin novedades no genera commit.
- **Resumen semanal**: los lunes en la primera corrida (08:17 ART) Telegram manda, silencioso, activos / nuevos / bajas / mediana USD/m² por barrio y los 3 que más bajaron. Si no hay snapshot previo, la mediana va sin variación.
- **Dados de baja**: `active=false` solo si esa zona se scrapeó OK. Si Zonaprop Botánico falló, esos avisos quedan como estaban.
- **Slugs de Zonaprop**: Botánico es `botanico-palermo` (el slug `botanico` solo redirige a todo el país). Barrio Norte y Palermo Chico están verificados. Cada aviso se descarta si la card no nombra esa zona.
- **Páginas = robots.txt**, no un número arbitrario (confirmado 2026-10-10):
  - Zonaprop: `Allow: /*pagina-2.html$` … `pagina-5.html$`, después `Disallow: /*pagina-*.html`. Tope 5.
  - Argenprop: `Allow: /*?pagina-1$` … `pagina-3$`, después `Disallow: /*?pagina-`. Tope 3. También `Disallow: /*?*&*`: no se pueden combinar query params (`?orden-…&pagina-2` está bloqueado). La paginación se arma como `?pagina-N` sobre la URL sin query.
  - Mercado Libre (inmuebles): el listado de categoría está permitido. `Disallow: /*_Desde_` (paginación), `/*_PriceRange_` / `/*_PriceMin_` / `/*_PriceMax_`. Tope 1 página por URL. La cobertura se parte por barrio + ambientes (slugs verificados en el `<title>`/`<h1>`). No se usa `_Desde_`. El precio tope queda en `matches()`.
- **Sin orden por más recientes**: Zonaprop bloquea `*-orden-*` salvo `*-orden-precio-ascendente.html`. Argenprop bloquea `/*?*orden-` salvo `?orden-menorprecio`. No usamos ninguno de los dos (el de precio mezclaría el recorte y, en Argenprop, no se puede juntar con `?pagina-N`).
- **Cobertura**: si en la última página *permitida* de una fuente todavía hay avisos que pasan filtros y nunca vimos, se loguea un warning y Telegram avisa como máximo una vez por semana (`state/*/meta.coverage_week`) con el texto «esta fuente puede tener avisos fuera de las páginas permitidas; conviene partirla en más URLs».
- **Partir fuentes saturadas** (Zonaprop, slugs verificados en el portal; el `<title>` conservó barrio, balcón y el filtro):
  - Recoleta: 1 amb ≤80k / 1 amb >80k / 2 amb ≤100k / 2 amb >100k / 3 amb ≤110k / 3 amb >110k.
  - Barrio Norte: 1 amb ≤110k / 1 amb >110k / 2 amb ≤110k / 2 amb >110k / 3 amb ≤110k / 3 amb >110k.
  - Botánico y Palermo Chico: 1 / 2 / 3 amb, cada uno con `menos-140000` (conteos verificados entran en 5 páginas).
  - Los tramos `mas-X` no pueden llevar también `menos-140000`: esa combinación redirige y **tira el balcón**. El techo de 140k queda en `matches()`. Esos tramos altos pueden seguir saturando; el warning de cobertura lo dice.
- **Argenprop**: URL general por barrio (`/dolares-hasta-140000`) más 2 y 3 ambientes en Recoleta, Barrio Norte y Botánico 2 amb (slugs verificados). 1 ambiente no tiene slug propio (redirige al listado general). Palermo Chico no se partió: el slug de 2 amb no devolvió título usable.
- **Un depto, una fila**: `place_key` junta el mismo aviso entre portales (calle + m² ±5 + ambientes). En Telegram el segundo portal no vuelve a gritar. En la web se ve una fila con “también en …”.
- **Mercado Libre**: 1 página por URL (robots bloquea `_Desde_`). Partido por barrio + 1/2/3 ambientes. Títulos verificados 2026-10-10 (`Departamentos en Venta en {barrio}, Capital Federal, N ambiente(s)`). Sin redirect. No hay filtro de precio usable (`_PriceRange_` está bloqueado). El techo de 140k queda en `matches()`. Las cards de emprendimiento (`EMPRENDIMIENTO` / `Desde US$`) se descartan. Precio en la card: `US$ 110.000`. m²: `cubiertos`.
- **Fecha de publicación del portal**: las cards de listado de Zonaprop (fixture real) no traen “publicado hace X”. No se parsea. `días` es desde `first_seen` del buscador.
- **Campos extra verificados**: expensas ARS en Zonaprop (`$ 350.000 Expensas` en la card). Piso/cochera solo si el texto de la card lo dice con un patrón claro (`7° piso`, `planta baja`, `cochera` / `sin cochera`). Antigüedad: `N años` o “a estrenar”.
- **Argenprop HTML de esta ronda**: WAF (202) desde este entorno; no se guardó fixture nuevo. El parseo de expensas/`N años` usa el mismo formato que el HTML sintético de tests (copiado de cards reales en la primera versión). Pendiente: bajar un fixture fresco desde la Mac.
- **Balcón en Argenprop**: el portal no deja un filtro de balcón usable en la URL. `/con-balcon/` se ignora o redirige al listado general. El recorte queda en el texto (`require_balcon` + “sin balcón”). Zonaprop sí filtra con `-con-balcon-` en el slug. Mercado Libre: no hay slug de balcón verificado en estos listados; también queda en el texto.
- **Respeto de robots.txt**: solo páginas de listado que el portal permite (Zonaprop 1–5, Argenprop 1–3, Mercado Libre 1), con pausa de 3–6 s entre pedidos. Sin proxies ni evasión anti-bot.
- **m²**: Argenprop cubie.; Zonaprop a menudo `N m² tot.` (a veces desglosa Cubiertos/Semicubiertos/Totales en el texto); Mercado Libre cubiertos. Si hay desglose se pondera (100/50/30). El total solo no se trata como cubierto.
- Alternativa sin código: ambos portales tienen "Crear alerta" por email con tus filtros; sirve de respaldo.

## Pendiente / no verificado

- **Fecha de publicación del portal**: las cards de listado de Zonaprop no la muestran; no se parsea.
- **Argenprop, fixture fresco**: esta ronda el WAF contestó 202 y no se pudo guardar HTML nuevo. Expensas/`N años` se parsean con el formato ya visto en cards (y en el HTML sintético de tests). Conviene bajar un listado desde la Mac y dejarlo en `fixtures/`.
- **Piso / cochera / antigüedad en Zonaprop**: no hay campo estructurado en la card; solo se toma si el texto trae un patrón claro. “Piso alto” no se convierte a número.
- **Expensas a USD**: no hay fuente de cotización verificada; se dejan en ARS.
- **Argenprop, partir por ambientes o precio**: no verificado (WAF 202). Si Recoleta/BN saturan las 3 páginas, hay que armar y comprobar esas URLs desde la Mac (sin `?` combinados: robots bloquea `?*&*`).
- **Zonaprop `mas-X-dolar` + `menos-Y-dolar` + `con-balcon`**: no usarlo. En pruebas reales (`mas-80000` + `menos-140000`, `mas-de-80000-dolar`, `desde-80000`) el portal redirige y pierde el balcón.
- **Orden por más recientes**: bloqueado en ambos robots.txt (salvo precio ascendente / `?orden-menorprecio`). No agregar `-orden-publicado-descendente` ni `?orden=masnuevos`. El slug `ordenado-publicado-descendente` de Zonaprop además tira el balcón.
- **Properati**: el listado existe (`/s/{barrio}/departamento/venta`) y robots no lo bloquea, pero desde esta red contestó 401 Access Denied. Sin HTML propio no se agrega.
- **Mercado Libre, más de una página**: no. `_Desde_` está en Disallow.
- **Comparables de venta**: no hay precios de venta públicos en Argentina. La salida sigue fija por barrio.
- **USD de cochera**: Mudafy resta un promedio; no hay número verificado acá (`cochera_usd: null`). Solo se saca de medianas y del aire.
- **Ficha interna / robots**: no se entra al aviso. Cubiertos extra se recuperan del título o del texto de la card si aparecen. Pendiente si robots.txt lo permite.
- **Ganancias / habitualidad / IIBB**: no se calculan ni se muestran; quedan en los supuestos de `config.json`.
- **Tiempo en el portal**: “publicado hace N días” no se parsea; `días` es `first_seen`.
- **Azcuénaga / Ecuador**: no inventar rangos de `weak_streets` hasta confirmar altura.
- **Orientación / interno / luz / ruido**: no se puntúan. La nota de visita es el lugar.

## Pruebas locales

```bash
pip install -r requirements.txt
python test_parsers.py            # parser, filtros, estado por portal, Telegram mockeado
python scraper.py --dry-run       # búsqueda real, imprime en consola (sin Telegram ni archivos)
python scraper.py --enrich        # relee listados y completa fotos/ficha (sin Telegram)
python scraper.py --only argenprop
cd web && npm install && npm run build
```

## Argenprop en la Mac (launchd)

Actions no puede scrapear Argenprop. El script local hace `pull → scrape → commit solo archivos de Argenprop → push`.

Una vez:

1. Creá `.env` en la raíz (no se sube a git) con `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Si ya tenés la web, agregá también `SITE_URL`.
2. `chmod +x scripts/buscar-argenprop-local.sh scripts/launchd-run-argenprop.sh`
3. `mkdir -p ~/Library/Application\ Support/search-amb ~/Library/Logs/search-amb`
4. `cp scripts/launchd-run-argenprop.sh ~/Library/Application\ Support/search-amb/run-argenprop.sh`
5. `cp scripts/com.search-amb.argenprop.plist ~/Library/LaunchAgents/`
6. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.search-amb.argenprop.plist`
   Si ya lo tenías: `launchctl bootout gui/$(id -u)/com.search-amb.argenprop` y después `bootstrap` de nuevo.

La Mac tiene que estar encendida, y git tiene que poder pushear solo (llave SSH o `gh auth`). Horarios: 8:20, 11:20, 14:20, 17:20, 20:20. Log: `~/Library/Logs/search-amb/argenprop-local.log`. El wrapper vive fuera de `Documents`: launchd no puede abrir stdout ahí (EX_CONFIG 78) ni ejecutar scripts de esa carpeta (exit 126).

```bash
./scripts/buscar-argenprop-local.sh           # scrape + sync
./scripts/buscar-argenprop-local.sh --no-sync # solo scrape
```

Cron equivalente: `20 8,11,14,17,20 * * * /Users/ivan/Documents/Codigo/search_amb/scripts/buscar-argenprop-local.sh`
