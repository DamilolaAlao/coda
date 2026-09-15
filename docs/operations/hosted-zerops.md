# Hosted T3 server (Zerops)

> For maintainers. Using Coda? See [docs/user](../user/).

This fork's hosted backend lives on Zerops (`coda` / `app`). The web UI is Vercel; the server
process must have the `hermes` CLI on `PATH` because T3 only wraps provider binaries.

## Layout

[`deploy/zerops/`](../../deploy/zerops/) is the push directory. It is **not** the git monorepo
root: the T3 server is a `vp pack` bundle copied in as `dist/`.

| File | Role |
| --- | --- |
| `package.json` | `node dist/bin.mjs serve` plus native deps (`@ff-labs/fff-node`, `node-pty`) |
| `install-hermes.sh` | Non-interactive Hermes install into `vendor/`, ACP extra, OpenCode Go `config.yaml` |
| `hermes-wrapper.sh` | Relocatable `bin/hermes` (rewrites uv venv paths from `/build/source` to the unpack root) |
| `start.sh` | Puts `bin/` on `PATH` and starts T3 |
| `zerops.yml` | Build + runtime recipe |

## Push

From a clean checkout:

```bash
vp run --filter t3 build:bundle
rm -rf /tmp/coda-zerops
mkdir -p /tmp/coda-zerops
cp -R deploy/zerops/. /tmp/coda-zerops/
rsync -a --include='*.mjs' --exclude='*.map' --exclude='*' apps/server/dist/ /tmp/coda-zerops/dist/
zcli service push app -P <project-id> --working-dir /tmp/coda-zerops --no-git
```

Do not set a `PATH` env var in `zerops.yml`; Zerops reserves that key. `start.sh` prefixes `bin/`
instead.

Hermes auth is still an OpenCode Go API key in T3 Settings (or `OPENCODE_GO_API_KEY` in Hermes's
`.env`). The installer only writes `model.provider: opencode-go`.
