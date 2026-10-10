# Buscador de departamentos (Argenprop + Zonaprop → Telegram)

Corre solo en GitHub Actions (gratis), 5 veces por día, y te manda por Telegram los avisos **nuevos** (y las bajas de precio) que cumplan tus filtros.

Filtros actuales (`config.json`): venta · con balcón · Recoleta, Barrio Norte, Botánico, Palermo Chico · hasta 3 ambientes · mínimo 50 m² · presupuesto USD 125.000 (techo duro 140.000).

Criterio (no todo es excluyente):

- **Corta** (si no entra, no avisa): **balcón**, ambientes, m², y techos de precio *duros* (más de 140k). La búsqueda en el portal ya viene filtrada `con-balcon`; si el texto dice “sin balcón”, también se descarta.
- **Suma** (ordena y etiqueta, no descarta): de época (mejor), “para reciclar” en el título, edificio en buen estado. El precio viene después: 125k es el gusto; un poco más entra con etiqueta `sobre presupuesto` y baja un poco el ranking. Un de época a 132k sale antes que un genérico a 108k.

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

- **Bloqueos anti-bot**: Zonaprop (Cloudflare) y Argenprop (AWS WAF) a veces bloquean IPs de datacenter como las de GitHub. Si pasa, el bot te manda un aviso por Telegram (una vez por día) con el motivo. Si es persistente, la alternativa gratis es correr el mismo script en tu Mac con `cron`/`launchd`, donde la IP es residencial.
- **Slugs de barrio sin verificar**: los slugs de `botanico`, `palermo-chico` y `barrio-norte` están armados con el patrón de cada portal pero no pude probarlos en vivo. Si alguno da 404, el aviso de error te lo dice; corregí la URL abriendo el portal, filtrando a mano y copiando la dirección.
- **Respeto de robots.txt**: se leen solo las páginas de listado permitidas (máx. 3 páginas por barrio), con pausa de 3–6 s entre pedidos.
- **m²**: Argenprop publica cubierta/semicubierta (se suman); Zonaprop publica total. Pueden diferir un poco del m² "real" del aviso.
- Alternativa sin código: ambos portales tienen "Crear alerta" por email con tus filtros; sirve de respaldo.

## Pruebas locales

```bash
pip install -r requirements.txt
python test_parsers.py            # pruebas offline del parser y filtros
python scraper.py --dry-run       # búsqueda real, imprime en consola (sin Telegram)
```
