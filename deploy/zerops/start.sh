#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -d /home/zerops/bin ]; then
  export PATH="/home/zerops/bin:$PATH"
fi
export PATH="$ROOT/bin:$PATH"

DATA_ROOT="${CODA_DATA_ROOT:-/srv/coda-data}"

migrate_dir_if_empty() {
  src="$1"
  dst="$2"
  if [ ! -d "$src" ]; then
    return 0
  fi
  if [ -d "$dst" ] && [ -n "$(ls -A "$dst" 2>/dev/null || true)" ]; then
    return 0
  fi
  mkdir -p "$dst"
  if [ -n "$(ls -A "$src" 2>/dev/null || true)" ]; then
    cp -a "$src/." "$dst/" 2>/dev/null || true
  fi
}

# First boot after attaching Local Storage: copy any state from the old
# ephemeral container paths (pre-volume deploys).
migrate_dir_if_empty /home/zerops/.t3 "$DATA_ROOT/.t3"
migrate_dir_if_empty /home/zerops/coda "$DATA_ROOT/coda"
migrate_dir_if_empty /home/zerops/deployments "$DATA_ROOT/deployments"
migrate_dir_if_empty /home/zerops/vendor/hermes-home "$DATA_ROOT/hermes"
migrate_dir_if_empty "$ROOT/vendor/hermes-home" "$DATA_ROOT/hermes"

export HERMES_HOME="${HERMES_HOME:-$DATA_ROOT/hermes}"
export HOME="${HOME:-$DATA_ROOT/coda}"
mkdir -p "$HOME"
# Previous deploys stored T3CODE_HOME in the workspace. Drop those leftovers
# so ~/ stays a project workspace; do not touch unrelated files users add later.
rm -rf "$HOME/userdata" "$HOME/secrets" "$HOME/runtime" "$HOME/settings.json"
export T3CODE_HOME="${T3CODE_HOME:-$DATA_ROOT/.t3}"
mkdir -p "$T3CODE_HOME"
export CODA_DEPLOYMENTS_HOME="${CODA_DEPLOYMENTS_HOME:-$DATA_ROOT/deployments}"
mkdir -p "$CODA_DEPLOYMENTS_HOME/config" "$CODA_DEPLOYMENTS_HOME/share" \
  "$CODA_DEPLOYMENTS_HOME/cache" "$CODA_DEPLOYMENTS_HOME/state"
mkdir -p "$HERMES_HOME"

# Prepare installs deps under /home/zerops so /var/www deploys cannot wipe them.
# ESM ignores NODE_PATH, so the app tree must see node_modules next to dist/.
HOME_MODULES="/home/zerops/node_modules"
if [ -d "$HOME_MODULES" ]; then
  if [ -e "$ROOT/node_modules" ] && [ ! -L "$ROOT/node_modules" ]; then
    rm -rf "$ROOT/node_modules"
  fi
  ln -sfn "$HOME_MODULES" "$ROOT/node_modules"
fi
export NODE_PATH="${HOME_MODULES}${NODE_PATH:+:$NODE_PATH}"

if [ -f "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" ]; then
  sed -i "s|/build/source|$ROOT|g" "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" || true
fi

exec node "$ROOT/dist/bin.mjs" serve --host 0.0.0.0 --port "${T3CODE_PORT:-3773}"
