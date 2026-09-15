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
sed "s/__IMAGE_TAG__/${IMAGE_TAG}/g" "$ROOT/deploy/zerops/zerops.yml" > "$OUT/zerops.yml"
chmod +x "$OUT/install-hermes.sh" "$OUT/hermes-wrapper.sh" "$OUT/start.sh" "$OUT/run.sh"

rsync -a --include='*.mjs' --exclude='*.map' --exclude='*' "$ROOT/apps/server/dist/" "$OUT/dist/"
rsync -a "$ROOT/apps/web/dist/" "$OUT/dist/client/"

test -f "$OUT/dist/bin.mjs"
test -f "$OUT/dist/client/index.html"
