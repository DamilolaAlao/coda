# Hosted Coda (Zerops)

> For maintainers. Using Coda? See [docs/user](../user/).

This is a single-container T3 server plus the built web client on native Node 24
(not a Docker VM), so Automatic Scaling can move CPU, RAM, and disk. Hermes and
native addons are installed in the cached runtime image via `run.prepareCommands`.

Do not bake `VITE_HTTP_URL`, `VITE_WS_URL`, a pairing PIN, or a public origin into
the web bundle. Same-origin serving is the default: the browser talks to the host
it loaded.

## Secrets

Never put a live pairing PIN or deploy token in git.

| Variable | Where |
| --- | --- |
| `T3CODE_PAIRING_CODE` | Six-digit PIN. Set in `deploy/zerops/.env` (gitignored) for `pack.sh`, or in the Zerops service env UI. If unset or not six digits, passcode pairing is off. |
| `T3CODE_PUBLIC_URL` | Public `https://` origin. Used as the pairing JWT audience. Same sources as the PIN. |
| Zerops token | `zcli login`, not the repo |

Copy [`deploy/zerops/.env.example`](../../deploy/zerops/.env.example) to
`deploy/zerops/.env` and fill in your values.

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
| `.env.example` | Template for pack-time `T3CODE_PUBLIC_URL` / `T3CODE_PAIRING_CODE` |
| `Dockerfile` / `run.sh` | Optional local Docker image; not used on Zerops |

## Push

From a clean checkout:

```bash
cp deploy/zerops/.env.example deploy/zerops/.env
# edit .env
chmod +x deploy/zerops/pack.sh
deploy/zerops/pack.sh /tmp/coda-zerops
zcli service push stack -P <project-id> --working-dir /tmp/coda-zerops --no-git
```

`pack.sh` stamps `IMAGE_TAG` with the current git short SHA (cache-busting only) and
substitutes `__T3CODE_PUBLIC_URL__` / `__T3CODE_PAIRING_CODE__` from the environment
or `deploy/zerops/.env`.

Do not set a `PATH` env var in `zerops.yml`; Zerops reserves that key.

Hermes auth is still an OpenCode Go API key in T3 Settings (or `OPENCODE_GO_API_KEY` in Hermes's
`.env`). The installer only writes `model.provider: opencode-go`.

## Scaling

`stack` uses Automatic Scaling on a single container (`minContainers`/`maxContainers` = 1)
because T3 state is SQLite. CPU/RAM/disk scale inside that container between the min and
max in `zerops.yml`. Docker VMs cannot do that — they only take fixed `cpu`/`ram`/`disk`.
LIGHT projects cap below the yaml max (typically 3 CPU / 6 GB RAM).

## Persistence

`HOME` is `/home/zerops/coda` (`~/`): an empty workspace for agent projects. `T3CODE_HOME` is
`/home/zerops/.t3` (pairing keys, SQLite). `CODA_DEPLOYMENTS_HOME` is `/home/zerops/deployments`
(XDG config/cache for zcli and other deploy CLIs). Agent and terminal processes do not inherit
`T3CODE_*`, `VITE_*`, or `ZEROPS_*`, so they cannot treat this Coda host as their deploy target.
