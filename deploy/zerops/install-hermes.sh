#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
export HERMES_HOME="${HERMES_HOME:-$ROOT/vendor/hermes-home}"
export HERMES_INSTALL_DIR="${HERMES_INSTALL_DIR:-$ROOT/vendor/hermes-agent}"
export HOME="${HERMES_INSTALL_HOME:-$ROOT/vendor/hermes-user}"

mkdir -p "$HERMES_HOME" "$HOME" "$ROOT/bin"

if [ ! -x "$ROOT/bin/hermes" ]; then
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- \
    --non-interactive \
    --skip-setup \
    --skip-browser \
    --skip-computer-use \
    --no-skills \
    --hermes-home "$HERMES_HOME"

  VENV="$HERMES_INSTALL_DIR/venv"
  if [ ! -x "$VENV/bin/python" ]; then
    VENV="$HERMES_INSTALL_DIR/.venv"
  fi
  if [ ! -x "$VENV/bin/python" ]; then
    echo "Hermes venv python not found after install" >&2
    ls -la "$HERMES_INSTALL_DIR" >&2 || true
    exit 1
  fi

  UV="$HERMES_HOME/bin/uv"
  if [ -x "$UV" ]; then
    (cd "$HERMES_INSTALL_DIR" && "$UV" pip install --python "$VENV/bin/python" -e ".[acp]") || true
  fi

  cp "$ROOT/hermes-wrapper.sh" "$ROOT/bin/hermes"
  chmod +x "$ROOT/bin/hermes"
fi

"$ROOT/bin/hermes" --version
"$ROOT/bin/hermes" acp --check || true

printf 'model:\n  default: kimi-k3\n  provider: opencode-go\n' > "$HERMES_HOME/config.yaml"
