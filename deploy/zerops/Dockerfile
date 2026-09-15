FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-venv make g++ curl git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY dist ./dist
COPY install-hermes.sh hermes-wrapper.sh start.sh ./

RUN npm i --omit=dev --ignore-scripts=false \
  && test -d node_modules/@ff-labs/fff-node \
  && npm rebuild node-pty --foreground-scripts || true \
  && chmod +x install-hermes.sh start.sh hermes-wrapper.sh \
  && ./install-hermes.sh \
  && mkdir -p /data

ENV NODE_ENV=production \
  T3CODE_HOST=0.0.0.0 \
  T3CODE_PORT=3773 \
  T3CODE_HOME=/data \
  HERMES_HOME=/app/vendor/hermes-home \
  NODE_PATH=/app/node_modules

VOLUME /data
EXPOSE 3773

CMD ["./start.sh"]
