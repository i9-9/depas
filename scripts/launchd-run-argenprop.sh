#!/bin/bash
# Entrypoint de launchd. Se copia a ~/Library/Application Support/search-amb/
# porque launchd no puede ejecutar un script que viva en Documents o Dropbox.
# La corrida de verdad está en el repo: un cambio ahí vale sin volver a copiar este archivo.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${SEARCH_AMB_ROOT:-}" ]]; then
  ROOT="$SEARCH_AMB_ROOT"
elif [[ -f "$HERE/root" ]]; then
  ROOT="$(tr -d '[:space:]' <"$HERE/root")"
elif [[ -f "$HERE/../scraper.py" ]]; then
  ROOT="$(cd "$HERE/.." && pwd)"
else
  echo "No encuentro el repo. Corré scripts/install-argenprop-launchd.sh" >&2
  exit 2
fi

if [[ ! -x "$ROOT/scripts/buscar-argenprop-local.sh" ]]; then
  echo "No está $ROOT/scripts/buscar-argenprop-local.sh" >&2
  exit 2
fi

exec "$ROOT/scripts/buscar-argenprop-local.sh" "$@"
