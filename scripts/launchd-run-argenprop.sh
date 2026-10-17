#!/bin/bash
# Entrypoint de launchd. Vive en ~/Library/Application Support/search-amb/
# (copia instalada). bash de launchd no puede leer ni ejecutar scripts en Documents.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT="/Users/wohl5/Dropbox/USUARIOS/IVAN/CURSOR/GIF_MAKER/depas"
LOG_DIR="${HOME}/Library/Logs/search-amb"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/argenprop-local.log"
cd "$ROOT"

SYNC=1
if [[ "${1:-}" == "--no-sync" ]] || [[ "${SYNC_GIT:-1}" == "0" ]]; then
  SYNC=0
fi

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "Falta $ROOT/.env con TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID" >&2
  exit 2
fi

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="python3"
fi

log() { echo "$*"; }

AP_PATHS='state/seen-argenprop.json|web/data/listings-argenprop.json|state/weekly.json'
NOISE='web/tsconfig.tsbuildinfo|web/AGENTS.md|argenprop-local.log'

other_dirty() {
  git -C "$ROOT" status --porcelain | grep -vE "^\?\?|${AP_PATHS}|${NOISE}" | grep -q .
}

sync_argenprop() {
  local branch
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  git -C "$ROOT" add state/seen-argenprop.json web/data/listings-argenprop.json state/weekly.json
  if git -C "$ROOT" diff --cached --quiet; then
    log "Argenprop sin cambios; no hay commit"
    return 0
  fi
  git -C "$ROOT" commit -m "Actualizar avisos (Argenprop local)"
  if other_dirty; then
    log "hay otros cambios locales; no hago rebase. git push a mano si hace falta"
    git -C "$ROOT" push "origin" "$branch" || log "WARN push falló"
    return 0
  fi
  git -C "$ROOT" pull --rebase "origin" "$branch" || log "WARN rebase falló"
  git -C "$ROOT" push "origin" "$branch" || log "WARN push falló"
  log "Argenprop pusheado a origin/$branch"
}

run() {
  echo "==== $(date) ===="
  if [[ "$SYNC" -eq 1 ]]; then
    branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
    if other_dirty; then
      log "hay cambios locales; salteo pull y scrapeo igual"
    else
      log "pull origin/$branch"
      git -C "$ROOT" pull --rebase "origin" "$branch" || log "WARN pull falló; sigo con el scrape"
    fi
  fi
  "$PY" "$ROOT/scraper.py" --only argenprop
  if [[ "$SYNC" -eq 1 ]]; then
    sync_argenprop
  else
    log "sync git desactivado"
  fi
}

run
# launchd ya redirige stdout/stderr a este log; no teear de nuevo.
