#!/bin/sh
# Relocatable Hermes launcher. The uv venv is built under a Zerops build path
# (`/build/source`) and unpacked onto `/var/www` at runtime.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HERMES_HOME="${HERMES_HOME:-$ROOT/vendor/hermes-home}"
VENV="$ROOT/vendor/hermes-agent/venv"
if [ ! -x "$VENV/bin/python" ]; then
  VENV="$ROOT/vendor/hermes-agent/.venv"
fi
if [ -f "$VENV/pyvenv.cfg" ]; then
  sed -i "s|/build/source|$ROOT|g" "$VENV/pyvenv.cfg" || true
fi
exec "$VENV/bin/python" "$ROOT/vendor/hermes-agent/hermes" "$@"
