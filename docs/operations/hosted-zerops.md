# Hosted Coda (Zerops)

> For maintainers. Using Coda? See [docs/user](../user/).

This fork's hosted Docker image lives on Zerops (`coda` / `stack`):
the T3 server plus the built web client (`dist/client`). Hermes is installed in the image
because T3 only wraps provider binaries.

## Layout

[`deploy/zerops/`](../../deploy/zerops/) is the push directory. It is **not** the git monorepo
root.

| File | Role |
| --- | --- |
| `Dockerfile` | Single image: Node 24, native addons, Hermes, `serve` on 3773 |
| `package.json` | Runtime deps (`@ff-labs/fff-node`, `node-pty`) |
| `install-hermes.sh` | Non-interactive Hermes install into `vendor/` |
| `hermes-wrapper.sh` | Relocatable `bin/hermes` |
| `run.sh` | Zerops start: `docker build` + `docker run --network=host` |
| `zerops.yml` | Build copies the context; runtime `docker build` + `docker run --network=host` |
| `pack.sh` | Bundles server + web dist into a push directory |

## Push

From a clean checkout:

```bash
chmod +x deploy/zerops/pack.sh
deploy/zerops/pack.sh /tmp/coda-zerops
zcli service push stack -P <project-id> --working-dir /tmp/coda-zerops --no-git
```

`pack.sh` stamps the image tag with the current git short SHA so Zerops rebuilds on each push.

Do not set a `PATH` env var in `zerops.yml`; Zerops reserves that key.

Hermes auth is still an OpenCode Go API key in T3 Settings (or `OPENCODE_GO_API_KEY` in Hermes's
`.env`). The installer only writes `model.provider: opencode-go`.

## Persistence

`T3CODE_HOME` is `/data` inside the app container. `run.sh` mounts a Docker named
volume (`coda-data`) there so pairing keys, SQLite, and preview tabs survive Zerops
extracts into `/var/www`. Leftover `/var/www/data` from older bind-mounts is copied
into the volume once if the volume is empty.
