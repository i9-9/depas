# Buscador de departamentos (Argenprop + Zonaprop → Telegram)

Corre solo en GitHub Actions (gratis), 5 veces por día, y te manda por Telegram los avisos **nuevos** (y las bajas de precio) que cumplan tus filtros. Cada aviso dice *por qué* entró y, si la card trae foto, la manda.

Filtros actuales (`config.json`): venta · con balcón · Recoleta, Barrio Norte, Botánico, Palermo Chico · hasta 3 ambientes · mínimo 50 m² · precio entre USD 20.000 y 140.000 (gusto 125.000).

Criterio (no todo es excluyente):

- **Corta** (si no entra, no avisa): **balcón**, ambientes, m², techo de precio, y **zona**. Tiene que nombrar Recoleta / Barrio Norte / Botánico / Palermo Chico. Se descartan pozo, cuotas, y otros barrios (Tigre, Once, Lanús, etc.).
- **Suma** (ordena y etiqueta, no descarta): de época (mejor), “para reciclar” en el título, edificio en buen estado. El precio viene después: 125k es el gusto; un poco más entra con etiqueta `sobre presupuesto` y baja un poco el ranking. Un de época a 132k sale antes que un genérico a 108k.
- **Un aviso por depto**: si el mismo (calle + altura + precio + m²) sale en los dos portales o en Recoleta y Barrio Norte, te llega una vez. Si no hay dirección con número, no se agrupa.

## Setup (una sola vez, ~10 minutos)

1. **Crear el bot**: en Telegram hablá con `@BotFather` → `/newbot` → copiá el **token**.
2. **Obtener tu chat ID**: mandale cualquier mensaje a tu bot nuevo y abrí
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → copiá `"chat":{"id": ...}`.
3. **Crear el repo en GitHub**: nuevo repo **privado** (cuenta `i9-9`) y subí esta carpeta.
   Privado = no expone tu búsqueda, y las ~150 corridas por mes entran de sobra en los minutos gratis.
4. **Cargar los secrets**: Settings → Secrets and variables → Actions → New repository secret:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
5. **Primera corrida**: pestaña Actions → "Buscar departamentos" → Run workflow.
   Te llega un resumen con los avisos actuales (los marca como vistos) y de ahí en más solo los nuevos.

Horarios (hora Argentina): 08:17, 11:17, 14:17, 17:17, 20:17. Se cambian en `.github/workflows/buscar.yml` (el cron está en UTC).

## Cambiar filtros

Editá `config.json`: `max_price_usd` (gusto), `max_price_usd_hard` (corte), `min_area_m2`, `max_ambientes`, y la lista `sources` (una URL por portal y barrio; las URLs tienen que llegar hasta el techo duro).
`include_unknown_area: true` te avisa también de los avisos que no publican m² (así no se te escapa ninguno).
Las preferencias (época, reciclar, edificio) están en `signals`: keywords y pesos. No filtran; si el portal no lo escribe en el listado, el aviso igual entra y vos lo juzgás por las fotos.

## Cosas a tener en cuenta

- **Argenprop desde Actions**: AWS WAF bloquea las IPs de GitHub (405 / challenge). El workflow **salta Argenprop** y avisa una vez por día. Zonaprop sigue en Actions. Argenprop se corre en la Mac (abajo).
- **Slugs de Zonaprop**: Botánico es `botanico-palermo` (el slug `botanico` solo redirige a todo el país). Barrio Norte y Palermo Chico están verificados. Cada aviso se descarta si la card no nombra esa zona.
- **Respeto de robots.txt**: se leen solo las páginas de listado permitidas (máx. 3 páginas por barrio), con pausa de 3–6 s entre pedidos.
- **m²**: Argenprop publica cubierta/semicubierta (se suman); Zonaprop publica total. Pueden diferir un poco del m² "real" del aviso.
- Alternativa sin código: ambos portales tienen "Crear alerta" por email con tus filtros; sirve de respaldo.

## Pruebas locales

```bash
pip install -r requirements.txt
python test_parsers.py            # pruebas offline del parser y filtros
python scraper.py --dry-run       # búsqueda real, imprime en consola (sin Telegram)
python scraper.py --only argenprop
```

## Argenprop en la Mac (launchd)

Actions no puede scrapear Argenprop. El script local hace `pull → scrape → commit seen.json → push`, así Actions no te reavisa lo mismo.

Una vez:

1. Creá `.env` en la raíz (no se sube a git) con `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
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
