#!/bin/sh
set -eu

IMAGE_TAG="${IMAGE_TAG:-coda-local}"
VOLUME="${T3CODE_DOCKER_VOLUME:-coda-data}"

docker volume create "$VOLUME" >/dev/null
docker rm -f coda-runtime >/dev/null 2>&1 || true
docker build -t "coda:${IMAGE_TAG}" /var/www

# Copy leftover host bind-mount data into the volume once, if the volume is empty.
if [ -d /var/www/data ] && [ -n "$(ls -A /var/www/data 2>/dev/null || true)" ]; then
  docker run --rm --network=none --entrypoint /bin/sh \
    -v "$VOLUME":/data \
    -v /var/www/data:/from:ro \
    "coda:${IMAGE_TAG}" \
    -c 'if [ -z "$(ls -A /data 2>/dev/null || true)" ]; then cp -a /from/. /data/; fi'
fi

exec docker run --network=host --name coda-runtime \
  -e NODE_ENV \
  -e T3CODE_HOST \
  -e T3CODE_PORT \
  -e T3CODE_HOME \
  -e T3CODE_PUBLIC_URL \
  -e HERMES_HOME \
  -e GITHUB_CLIENT_ID \
  -e GITHUB_CLIENT_SECRET \
  -e GITHUB_REDIRECT_URI \
  -v "$VOLUME":/data \
  "coda:${IMAGE_TAG}"
