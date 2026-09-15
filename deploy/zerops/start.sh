#!/bin/sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/bin:$PATH"
export HERMES_HOME="${HERMES_HOME:-$ROOT/vendor/hermes-home}"
export NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
if [ -f "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" ]; then
  sed -i "s|/build/source|$ROOT|g" "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" || true
fi
exec npm start
