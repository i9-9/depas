# Buscador de departamentos (Argenprop + Zonaprop → Telegram + web)

Corre en GitHub Actions (gratis), 5 veces por día, y te manda por Telegram los avisos **nuevos** (y las bajas de precio) que cumplan tus filtros. Cada aviso dice *por qué* entró y, si la card trae foto, la manda. Los mismos avisos se publican en una web estática (Vercel, plan gratis) que se actualiza cuando el Action commitea datos nuevos.

Filtros actuales (`config.json`): venta · con balcón · Recoleta, Barrio Norte, Botánico, Palermo Chico · hasta 3 ambientes · mínimo 50 m² · precio entre USD 20.000 y 140.000 (gusto 125.000).

Criterio (no todo es excluyente):

- **Corta** (si no entra, no avisa): **balcón**, ambientes, m², techo de precio, y **zona**. Tiene que nombrar Recoleta / Barrio Norte / Botánico / Palermo Chico. Se descartan pozo y cuotas (`reject_text`, sobre todo el aviso) y otros barrios (`reject_barrios`: Tigre, Once, Congreso, etc., solo dirección/URL, no la descripción).
- **Suma** (ordena y etiqueta, no descarta): de época (mejor), “para reciclar” en el título, edificio en buen estado. El precio viene después: 125k es el gusto; un poco más entra con etiqueta `sobre presupuesto` y baja un poco el ranking. Un de época a 132k sale antes que un genérico a 108k.
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

La web es `noindex`. En el celular, desde Telegram, se abre la grilla de cards. Guardar / descartar queda en ese dispositivo (`localStorage`).

## Cambiar filtros

Editá `config.json`: `max_price_usd` (gusto), `max_price_usd_hard` (corte), `min_area_m2`, `max_ambientes`, `max_expensas_ars` (null = sin tope; sin dato de expensas el aviso entra), y la lista `sources` (una URL por portal y barrio; las URLs tienen que llegar hasta el techo duro).
`include_unknown_area: true` te avisa también de los avisos que no publican m² (así no se te escapa ninguno).
Las preferencias (época, reciclar, edificio) están en `signals`: keywords y pesos. No filtran; si el portal no lo escribe en el listado, el aviso igual entra y vos lo juzgás por las fotos.
`heartbeat: false` (default): si lo prendes, la primera corrida del día (08:17 ART / 11 UTC) avisa por Telegram, siempre silencioso, cuando no hubo novedades, con la cantidad de avisos activos.
`notify_loud_min_score` (2) y `notify_loud_drop_pct` (5): por debajo, Telegram manda el aviso con `disable_notification` (sin sonido). Score alto o una baja de al menos ese % suenan.
`closing_discount_pct` (5) y `closing_discount_source` alimentan la “referencia de cierre” (no es tasación; promedio CABA). La mediana de USD/m² se calcula sobre tus avisos activos del mismo barrio y solo se muestra si hay al menos `median_min_n` (8).

## Cosas a tener en cuenta

- **Argenprop desde Actions**: AWS WAF bloquea las IPs de GitHub (405 / challenge). El workflow **salta Argenprop** (solo log, sin Telegram de error) y no toca sus archivos. Zonaprop sigue en Actions. Argenprop se corre en la Mac (abajo).
- **Estado separado**: `state/seen-zonaprop.json` + `web/data/listings-zonaprop.json` los escribe Actions. `state/seen-argenprop.json` + `web/data/listings-argenprop.json` los escribe la Mac. Así no se pisan.
- **Commit solo si cambió algo**: aviso nuevo, baja de precio, aviso dado de baja, warning de cobertura (máx. semanal) o el resumen semanal (`state/weekly.json`, los lunes). Una corrida sin novedades no genera commit.
- **Resumen semanal**: los lunes en la primera corrida (08:17 ART) Telegram manda, silencioso, activos / nuevos / bajas / mediana USD/m² por barrio y los 3 que más bajaron. Si no hay snapshot previo, la mediana va sin variación.
- **Dados de baja**: `active=false` solo si esa zona se scrapeó OK. Si Zonaprop Botánico falló, esos avisos quedan como estaban.
- **Slugs de Zonaprop**: Botánico es `botanico-palermo` (el slug `botanico` solo redirige a todo el país). Barrio Norte y Palermo Chico están verificados. Cada aviso se descarta si la card no nombra esa zona.
- **Orden por más recientes** (verificado en HTML real, oct 2026):
  - Zonaprop: slug `-orden-publicado-descendente` (el `<title>` pasa a “Departamentos más recientes…” y la página 2 conserva filtros). El slug `ordenado-publicado-descendente` **no** sirve: tira el filtro de balcón.
  - Argenprop: `?orden=masnuevos` (el propio listado pagina como `?orden=masnuevos&pagina-2`).
- **Cobertura**: si en la última de las 3 páginas todavía hay avisos que pasan filtros y nunca vimos, se loguea un warning y Telegram avisa como máximo una vez por semana (`state/*/meta.coverage_week`).
- **Fecha de publicación del portal**: las cards de listado de Zonaprop (fixture real) no traen “publicado hace X”. No se parsea. `días` es desde `first_seen` del buscador.
- **Campos extra verificados**: expensas ARS en Zonaprop (`$ 350.000 Expensas` en la card). Piso/cochera solo si el texto de la card lo dice con un patrón claro (`7° piso`, `planta baja`, `cochera` / `sin cochera`). Antigüedad: `N años` o “a estrenar”.
- **Argenprop HTML de esta ronda**: WAF (202) desde este entorno; no se guardó fixture nuevo. El parseo de expensas/`N años` usa el mismo formato que el HTML sintético de tests (copiado de cards reales en la primera versión). Pendiente: bajar un fixture fresco desde la Mac.
- **Balcón en Argenprop**: el portal no deja un filtro de balcón usable en la URL. `/con-balcon/` se ignora o redirige al listado general. El recorte queda en el texto (`require_balcon` + “sin balcón”). Zonaprop sí filtra con `-con-balcon-` en el slug.
- **Respeto de robots.txt**: se leen solo las páginas de listado permitidas (máx. 3 páginas por barrio), con pausa de 3–6 s entre pedidos. Sin proxies ni evasión anti-bot.
- **m²**: Argenprop publica cubierta/semicubierta (se suman); Zonaprop publica total. Pueden diferir un poco del m² "real" del aviso.
- Alternativa sin código: ambos portales tienen "Crear alerta" por email con tus filtros; sirve de respaldo.

## Pendiente / no verificado

- **Fecha de publicación del portal**: las cards de listado de Zonaprop no la muestran; no se parsea.
- **Argenprop, fixture fresco**: esta ronda el WAF contestó 202 y no se pudo guardar HTML nuevo. Expensas/`N años` se parsean con el formato ya visto en cards (y en el HTML sintético de tests). Conviene bajar un listado desde la Mac y dejarlo en `fixtures/`.
- **Piso / cochera / antigüedad en Zonaprop**: no hay campo estructurado en la card; solo se toma si el texto trae un patrón claro. “Piso alto” no se convierte a número.
- **Expensas a USD**: no hay fuente de cotización verificada; se dejan en ARS.
- **Slug `ordenado-publicado-descendente` de Zonaprop**: no usarlo; en una prueba real tiró el filtro de balcón.

## Pruebas locales

```bash
pip install -r requirements.txt
python test_parsers.py            # parser, filtros, estado por portal, Telegram mockeado
python scraper.py --dry-run       # búsqueda real, imprime en consola (sin Telegram ni archivos)
python scraper.py --only argenprop
cd web && npm install && npm run build
```

## Argenprop en la Mac (launchd)

Actions no puede scrapear Argenprop. El script local hace `pull → scrape → commit solo archivos de Argenprop → push`.

Una vez:

1. Creá `.env` en la raíz (no se sube a git) con `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Si ya tenés la web, agregá también `SITE_URL`.
2. `chmod +x scripts/buscar-argenprop-local.sh`
3. `cp scripts/com.search-amb.argenprop.plist ~/Library/LaunchAgents/`
4. `launchctl load ~/Library/LaunchAgents/com.search-amb.argenprop.plist`
   Si ya lo tenías cargado: `launchctl unload ...` y después `load` de nuevo.

La Mac tiene que estar encendida, y git tiene que poder pushear solo (llave SSH o `gh auth`). Horarios: 8:20, 11:20, 14:20, 17:20, 20:20. Log: `argenprop-local.log`.

```bash
./scripts/buscar-argenprop-local.sh           # scrape + sync
./scripts/buscar-argenprop-local.sh --no-sync # solo scrape
```

Cron equivalente: `20 8,11,14,17,20 * * * /Users/ivan/Documents/Codigo/search_amb/scripts/buscar-argenprop-local.sh`
