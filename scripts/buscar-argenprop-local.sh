#!/bin/bash
# Corre solo Argenprop desde la Mac (IP residencial). Actions se salta ese portal.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

LOG="$ROOT/argenprop-local.log"
{
  echo "==== $(date) ===="
  "$PY" "$ROOT/scraper.py" --only argenprop
} >>"$LOG" 2>&1
