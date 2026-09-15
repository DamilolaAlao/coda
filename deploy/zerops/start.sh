#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/bin:$PATH"
export HERMES_HOME="${HERMES_HOME:-$ROOT/vendor/hermes-home}"
export NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
export T3CODE_HOME="${T3CODE_HOME:-/data}"
mkdir -p "$T3CODE_HOME"

if [ -f "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" ]; then
  sed -i "s|/build/source|$ROOT|g" "$ROOT/vendor/hermes-agent/venv/pyvenv.cfg" || true
fi

exec node dist/bin.mjs serve --host 0.0.0.0 --port "${T3CODE_PORT:-3773}"
