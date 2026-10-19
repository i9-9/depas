#!/bin/bash
# Instala el job de Argenprop para este usuario y esta carpeta del repo.
# Relanzarlo después de mover el repo: reescribe la ruta y recarga launchd.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPPORT="${HOME}/Library/Application Support/search-amb"
LOG_DIR="${HOME}/Library/Logs/search-amb"
AGENTS="${HOME}/Library/LaunchAgents"
PLIST_DEST="$AGENTS/com.search-amb.argenprop.plist"
LABEL="com.search-amb.argenprop"
UID_NUM="$(id -u)"

mkdir -p "$SUPPORT" "$LOG_DIR" "$AGENTS"
printf '%s\n' "$ROOT" >"$SUPPORT/root"
cp "$ROOT/scripts/launchd-run-argenprop.sh" "$SUPPORT/run-argenprop.sh"
chmod +x "$SUPPORT/run-argenprop.sh" \
  "$ROOT/scripts/buscar-argenprop-local.sh" \
  "$ROOT/scripts/launchd-run-argenprop.sh"

sed -e "s|__HOME__|${HOME}|g" \
  "$ROOT/scripts/com.search-amb.argenprop.plist" >"$PLIST_DEST"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo "Instalado."
echo "  repo:   $ROOT"
echo "  script: $SUPPORT/run-argenprop.sh"
echo "  plist:  $PLIST_DEST"
echo "  log:    $LOG_DIR/argenprop-local.log"
launchctl print "gui/${UID_NUM}/${LABEL}" | awk '/state =|runs =|path =/' || true
