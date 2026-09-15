# Hosted Coda (Zerops)

> For maintainers. Using Coda? See [docs/user](../user/).

This fork's hosted stack lives on Zerops (`coda` / `stack`): native Node 24 (not
a Docker VM) so Automatic Scaling can move CPU, RAM, and disk. The T3 server plus
the built web client (`dist/client`) run from `/var/www`. Hermes and native addons
are installed in the cached runtime image via `run.prepareCommands`.

## Layout

[`deploy/zerops/`](../../deploy/zerops/) is the push directory. It is **not** the git monorepo
root.

| File | Role |
| --- | --- |
| `package.json` | Runtime deps (`@ff-labs/fff-node`, `node-pty`) |
| `install-hermes.sh` | Non-interactive Hermes install into the runtime image |
| `hermes-wrapper.sh` | Relocatable `bin/hermes` |
| `start.sh` | Runtime start: `node dist/bin.mjs serve` |
| `zerops.yml` | Native Node 24 + Automatic Scaling; prepare installs Hermes |
| `pack.sh` | Bundles server + web dist into a push directory |
| `Dockerfile` / `run.sh` | Optional local Docker image; not used on Zerops |

## Push

From a clean checkout:

```bash
chmod +x deploy/zerops/pack.sh
deploy/zerops/pack.sh /tmp/coda-zerops
zcli service push stack -P <project-id> --working-dir /tmp/coda-zerops --no-git
```

`pack.sh` stamps `IMAGE_TAG` with the current git short SHA (cache-busting only).

Do not set a `PATH` env var in `zerops.yml`; Zerops reserves that key.

Hermes auth is still an OpenCode Go API key in T3 Settings (or `OPENCODE_GO_API_KEY` in Hermes's
`.env`). The installer only writes `model.provider: opencode-go`.

## Scaling

`stack` uses Automatic Scaling on a single container (`minContainers`/`maxContainers` = 1)
because T3 state is SQLite. CPU/RAM/disk scale inside that container between the min and
max in `zerops.yml`. Docker VMs cannot do that — they only take fixed `cpu`/`ram`/`disk`.

## Persistence

`T3CODE_HOME` is `/home/zerops/t3-home`, outside `/var/www`, so pairing keys, SQLite, and
preview tabs survive deploys that replace the app tree.
