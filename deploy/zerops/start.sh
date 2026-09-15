#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -d /home/zerops/bin ]; then
  export PATH="/home/zerops/bin:$PATH"
fi
export PATH="$ROOT/bin:$PATH"
export HERMES_HOME="${HERMES_HOME:-$ROOT/vendor/hermes-home}"
# Workspace ~ is an empty /home/zerops/coda. Runtime state stays in ~/.t3.
export HOME="${HOME_CODA:-/home/zerops/coda}"
mkdir -p "$HOME"
# Previous deploys stored T3CODE_HOME in this directory. Drop those leftovers
# so the workspace stays empty; do not touch unrelated files users add later.
rm -rf "$HOME/userdata" "$HOME/secrets" "$HOME/runtime" "$HOME/settings.json"
export T3CODE_HOME="${T3CODE_HOME:-/home/zerops/.t3}"
mkdir -p "$T3CODE_HOME"
# Agent/tool deploy state (zcli, flyctl, railway) — not Coda SQLite/pairing.
export CODA_DEPLOYMENTS_HOME="${CODA_DEPLOYMENTS_HOME:-/home/zerops/deployments}"
mkdir -p "$CODA_DEPLOYMENTS_HOME/config" "$CODA_DEPLOYMENTS_HOME/share" \
  "$CODA_DEPLOYMENTS_HOME/cache" "$CODA_DEPLOYMENTS_HOME/state"

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
