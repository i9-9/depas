#!/bin/bash
# Argenprop desde la Mac (IP residencial) y sync de su estado con GitHub.
# Usage:
#   ./scripts/buscar-argenprop-local.sh           # scrape + commit/push
#   ./scripts/buscar-argenprop-local.sh --no-sync # solo scrape (no git)
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/argenprop-local.log"
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

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="python3"
fi

log() { echo "$*"; }

AP_PATHS='state/seen-argenprop.json|web/data/listings-argenprop.json'

other_dirty() {
  git status --porcelain | grep -vE "^\?\?|${AP_PATHS}" | grep -q .
}

sync_argenprop() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git add state/seen-argenprop.json web/data/listings-argenprop.json
  if git diff --cached --quiet; then
    log "Argenprop sin cambios; no hay commit"
    return 0
  fi
  git commit -m "Actualizar avisos (Argenprop local)"
  if other_dirty(); then
    log "hay otros cambios locales; no hago rebase. git push a mano si hace falta"
    git push "origin" "$branch" || log "WARN push falló"
    return 0
  fi
  git pull --rebase "origin" "$branch" || log "WARN rebase falló"
  git push "origin" "$branch" || log "WARN push falló"
  log "Argenprop pusheado a origin/$branch"
}

run() {
  echo "==== $(date) ===="
  if [[ "$SYNC" -eq 1 ]]; then
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if other_dirty; then
      log "hay cambios locales; salteo pull y scrapeo igual"
    else
      log "pull origin/$branch"
      git pull --rebase "origin" "$branch" || log "WARN pull falló; sigo con el scrape"
    fi
  fi
  "$PY" "$ROOT/scraper.py" --only argenprop
  if [[ "$SYNC" -eq 1 ]]; then
    sync_argenprop
  else
    log "sync git desactivado"
  fi
}

run 2>&1 | tee -a "$LOG"
exit "${PIPESTATUS[0]}"
