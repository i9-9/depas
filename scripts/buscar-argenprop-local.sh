#!/bin/bash
# Argenprop desde la Mac (IP residencial) y sync de su estado con GitHub.
# Usage:
#   ./scripts/buscar-argenprop-local.sh           # scrape + commit/push
#   ./scripts/buscar-argenprop-local.sh --no-sync # solo scrape (no git)
#   ./scripts/buscar-argenprop-local.sh --check   # muestra el repo y si hay otros cambios
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/search-amb"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/argenprop-local.log"
LOCK_DIR="$LOG_DIR/argenprop.lockdir"

SYNC=1
CHECK=0
case "${1:-}" in
  --no-sync) SYNC=0 ;;
  --check) CHECK=1; SYNC=0 ;;
  -h|--help)
    echo "Usage: $0 [--no-sync | --check]"
    exit 0
    ;;
  "") ;;
  *)
    echo "Opción desconocida: $1" >&2
    exit 2
    ;;
esac
if [[ "${SYNC_GIT:-1}" == "0" ]]; then
  SYNC=0
fi

cd "$ROOT"

# Python carga .env solo. Si bash no puede leer Documents (launchd), no abortar.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" || true
  set +a
fi

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="python3"
fi

log() { echo "$*"; }

# Archivos que esta corrida puede commitear. El resto del working tree no se toca.
OWNED=(
  state/seen-argenprop.json
  web/data/listings-argenprop.json
  web/data/run-argenprop.json
  state/weekly.json
)
NOISE=(
  web/tsconfig.tsbuildinfo
  web/AGENTS.md
)

blocking_changes() {
  local line path skip allowed
  while IFS= read -r line; do
    [[ ${#line} -lt 4 ]] && continue
    path="${line:3}"
    case "$path" in
      *" -> "*) path="${path##* -> }" ;;
    esac
    skip=0
    for allowed in "${OWNED[@]}" "${NOISE[@]}"; do
      if [[ "$path" == "$allowed" ]]; then
        skip=1
        break
      fi
    done
    [[ "$skip" -eq 1 ]] && continue
    printf '%s\n' "$path"
  done < <(git -C "$ROOT" status --porcelain --untracked-files=no)
}

acquire_lock() {
  local pid
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ >"$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT
    return 0
  fi
  pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log "ya hay una corrida (pid $pid); salgo"
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo $$ >"$LOCK_DIR/pid"
  trap 'rm -rf "$LOCK_DIR"' EXIT
}

sync_argenprop() {
  local branch dirty f
  local existing=()
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  for f in "${OWNED[@]}"; do
    if [[ -e "$ROOT/$f" ]]; then
      existing+=("$f")
    fi
  done
  if [[ ${#existing[@]} -eq 0 ]]; then
    log "no hay archivos de Argenprop para commitear"
    return 0
  fi
  git -C "$ROOT" add -- "${existing[@]}"
  if git -C "$ROOT" diff --cached --quiet -- "${existing[@]}"; then
    log "Argenprop sin cambios; no hay commit"
    return 0
  fi
  git -C "$ROOT" commit -m "Actualizar avisos (Argenprop local)" -- "${existing[@]}"
  dirty="$(blocking_changes || true)"
  if [[ -n "$dirty" ]]; then
    log "hay otros cambios locales; pusheo sin rebase"
    log "$dirty"
    git -C "$ROOT" push "origin" "$branch" || log "WARN push falló; hace falta pull a mano"
    return 0
  fi
  if ! git -C "$ROOT" pull --rebase "origin" "$branch"; then
    git -C "$ROOT" rebase --abort || true
    log "WARN rebase falló; no pusheo"
    return 0
  fi
  git -C "$ROOT" push "origin" "$branch" || log "WARN push falló"
  log "Argenprop pusheado a origin/$branch"
}

run() {
  local branch dirty
  echo "==== $(date) ===="
  log "repo $ROOT"
  if [[ "$CHECK" -eq 1 ]]; then
    log "python $PY"
    dirty="$(blocking_changes || true)"
    if [[ -n "$dirty" ]]; then
      log "otros cambios (un pull --rebase se saltea):"
      log "$dirty"
    else
      log "working tree libre para pull"
    fi
    return 0
  fi
  acquire_lock
  if [[ "$SYNC" -eq 1 ]]; then
    branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
    dirty="$(blocking_changes || true)"
    if [[ -n "$dirty" ]]; then
      log "hay otros cambios locales; salteo pull y scrapeo igual"
      log "$dirty"
    else
      log "pull origin/$branch"
      if ! git -C "$ROOT" pull --rebase "origin" "$branch"; then
        git -C "$ROOT" rebase --abort || true
        log "WARN pull falló; sigo con el scrape"
      fi
    fi
  fi
  "$PY" "$ROOT/scraper.py" --only argenprop
  if [[ "$SYNC" -eq 1 ]]; then
    sync_argenprop
  else
    log "sync git desactivado"
  fi
}

if [[ "$CHECK" -eq 0 && -t 1 ]]; then
  run 2>&1 | tee -a "$LOG"
  exit "${PIPESTATUS[0]}"
fi
run
