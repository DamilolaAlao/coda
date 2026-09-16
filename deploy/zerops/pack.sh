#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-/tmp/coda-zerops}"

cd "$ROOT"

vp run --filter t3 build:bundle
vp run --filter @t3tools/web build

rm -rf "$OUT"
mkdir -p "$OUT/dist/client"

cp "$ROOT/deploy/zerops/Dockerfile" "$OUT/"
cp "$ROOT/deploy/zerops/.dockerignore" "$OUT/"
cp "$ROOT/deploy/zerops/package.json" "$OUT/"
cp "$ROOT/deploy/zerops/install-hermes.sh" "$OUT/"
cp "$ROOT/deploy/zerops/hermes-wrapper.sh" "$OUT/"
cp "$ROOT/deploy/zerops/start.sh" "$OUT/"
cp "$ROOT/deploy/zerops/run.sh" "$OUT/"
IMAGE_TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
if [ -f "$ROOT/deploy/zerops/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/deploy/zerops/.env"
  set +a
fi
PUBLIC_URL="${T3CODE_PUBLIC_URL:-}"
PAIRING_CODE="${T3CODE_PAIRING_CODE:-}"
GITHUB_ID="${GITHUB_CLIENT_ID:-}"
GITHUB_SECRET="${GITHUB_CLIENT_SECRET:-}"
GITHUB_CALLBACK="${GITHUB_REDIRECT_URI:-}"
sed \
  -e "s|__IMAGE_TAG__|${IMAGE_TAG}|g" \
  -e "s|__T3CODE_PUBLIC_URL__|${PUBLIC_URL}|g" \
  -e "s|__T3CODE_PAIRING_CODE__|${PAIRING_CODE}|g" \
  -e "s|__GITHUB_CLIENT_ID__|${GITHUB_ID}|g" \
  -e "s|__GITHUB_CLIENT_SECRET__|${GITHUB_SECRET}|g" \
  -e "s|__GITHUB_REDIRECT_URI__|${GITHUB_CALLBACK}|g" \
  "$ROOT/deploy/zerops/zerops.yml" > "$OUT/zerops.yml"
chmod +x "$OUT/install-hermes.sh" "$OUT/hermes-wrapper.sh" "$OUT/start.sh" "$OUT/run.sh"

rsync -a --include='*.mjs' --exclude='*.map' --exclude='*' "$ROOT/apps/server/dist/" "$OUT/dist/"
rsync -a "$ROOT/apps/web/dist/" "$OUT/dist/client/"

test -f "$OUT/dist/bin.mjs"
test -f "$OUT/dist/client/index.html"
