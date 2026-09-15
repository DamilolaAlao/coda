#!/bin/sh
set -eu

IMAGE_TAG="${IMAGE_TAG:-coda-local}"
HOST_DATA="${T3CODE_HOST_DATA:-/var/data}"
mkdir -p "$HOST_DATA"
# Previous images bind-mounted /var/www/data, which Zerops wipes on extract.
if [ -d /var/www/data ] && [ ! -e "$HOST_DATA/userdata" ]; then
  if [ -n "$(ls -A /var/www/data 2>/dev/null || true)" ]; then
    cp -a /var/www/data/. "$HOST_DATA"/
  fi
fi
docker rm -f coda-runtime >/dev/null 2>&1 || true
docker build -t "coda:${IMAGE_TAG}" /var/www
exec docker run --network=host --name coda-runtime \
  -e NODE_ENV \
  -e T3CODE_HOST \
  -e T3CODE_PORT \
  -e T3CODE_HOME \
  -e T3CODE_PUBLIC_URL \
  -e T3CODE_PAIRING_CODE \
  -e HERMES_HOME \
  -v "$HOST_DATA":/data \
  "coda:${IMAGE_TAG}"
