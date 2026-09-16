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

| Variable               | Where                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `T3CODE_PAIRING_CODE`  | Six-digit PIN. Set in `deploy/zerops/.env` (gitignored) for `pack.sh`, or in the Zerops service env UI. If unset or not six digits, passcode pairing is off. |
| `T3CODE_PUBLIC_URL`    | Public `https://` origin. Used as the pairing JWT audience. Same sources as the PIN.                                                                         |
| `GITHUB_CLIENT_ID`     | GitHub App or OAuth App client ID (`Iv23…` for GitHub Apps). Placeholders and numeric App IDs are ignored. Use a **public** GitHub App (hosted: `io-intel-dev`). Private apps 404 for anyone except the owner. Packed into `zerops.yml` by `pack.sh` or set in the Zerops service env UI. |
| `GITHUB_CLIENT_SECRET` | Client secret for the GitHub App. Same sources as `GITHUB_CLIENT_ID`.                                                                                        |
| `GITHUB_REDIRECT_URI`  | Exact public callback URL: `https://<stack-host>/api/auth/github/callback`. Register the same URL in the GitHub App. The callback stays public HTTP; Connect GitHub itself is an authenticated RPC that stores a one-time state for that client session. |
| Zerops token           | `zcli login`, not the repo                                                                                                                                   |

Copy [`deploy/zerops/.env.example`](../../deploy/zerops/.env.example) to
`deploy/zerops/.env` and fill in your values.

## Layout

[`deploy/zerops/`](../../deploy/zerops/) is the push directory. It is **not** the git monorepo
root.

| File                    | Role                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `package.json`          | Runtime deps (`@ff-labs/fff-node`, `node-pty`)              |
| `install-hermes.sh`     | Non-interactive Hermes install into the runtime image       |
| `hermes-wrapper.sh`     | Relocatable `bin/hermes`                                    |
| `start.sh`              | Runtime start: `node dist/bin.mjs serve`                    |
| `zerops.yml`            | Native Node 24 + Automatic Scaling; prepare installs Hermes |
| `pack.sh`               | Bundles server + web dist into a push directory             |
| `.env.example`          | Template for pack-time public URL and pairing code          |
| `Dockerfile` / `run.sh` | Optional local Docker image; not used on Zerops             |

## Push

Pushes to `main` pack and deploy `stack` through
[`.github/workflows/deploy-zerops.yml`](../../.github/workflows/deploy-zerops.yml).
Set these GitHub Actions secrets on the repo:

| Secret                 | Value                                      |
| ---------------------- | ------------------------------------------ |
| `ZEROPS_TOKEN`         | From Zerops → Access Token Management      |
| `T3CODE_PUBLIC_URL`    | Public `https://` origin                   |
| `T3CODE_PAIRING_CODE`  | Six-digit PIN used by `pack.sh`            |
| `CODA_GITHUB_CLIENT_ID`     | Public GitHub App client ID for hosted OAuth |
| `CODA_GITHUB_CLIENT_SECRET` | GitHub App client secret                   |
| `CODA_GITHUB_REDIRECT_URI`  | `https://www.iointel.dev/api/auth/github/callback` on production |

A one-off from a clean checkout still works:

```bash
cp deploy/zerops/.env.example deploy/zerops/.env
# edit .env
chmod +x deploy/zerops/pack.sh
deploy/zerops/pack.sh /tmp/coda-zerops
zcli service push stack -P <project-id> --working-dir /tmp/coda-zerops --no-git
```

`pack.sh` stamps `IMAGE_TAG` with the current git short SHA (cache-busting only) and substitutes
the public URL and pairing code from the environment or `deploy/zerops/.env`. GitHub OAuth secrets
remain service-level Zerops environment variables and are not copied into the push directory.

If `GITHUB_CLIENT_ID` starts with `Iv`, Coda treats it as a GitHub App and omits OAuth `scope` on
the authorize URL. Classic OAuth Apps still send `repo read:org workflow gist`. Unpublished GitHub
Apps 404 for anyone who is not the owner; publish the app in GitHub → Settings → Developer settings
if other people need Continue with GitHub.

Do not set a `PATH` env var in `zerops.yml`; Zerops reserves that key.

Hermes auth is still an OpenCode Go API key in T3 Settings (or `OPENCODE_GO_API_KEY` in Hermes's
`.env`). The installer only writes `model.provider: opencode-go`.

## Scaling

`stack` uses Automatic Scaling on a single container (`minContainers`/`maxContainers` = 1)
because T3 state is SQLite. CPU/RAM/disk scale inside that container between the min and
max in `zerops.yml`. Docker VMs cannot do that — they only take fixed `cpu`/`ram`/`disk`.
LIGHT projects cap below the yaml max (typically 3 CPU / 6 GB RAM).

## Persistence

Zerops runtime containers are ephemeral: anything outside a mounted volume is lost on redeploy.
`stack` mounts a Local Storage service (`data`) at `/srv/coda-data`.

One-time, create the volume service if the project does not have it yet:

```bash
zcli project service-import deploy/zerops/data-service-import.yml -P <project-id>
```

Then deploy `stack` as usual; `zerops.yml` wires the mount.

| Path                         | Role                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `/srv/coda-data/.t3`         | `T3CODE_HOME` — pairing keys, SQLite, settings, and per-session GitHub OAuth tokens under `userdata/secrets` |
| `/srv/coda-data/coda`        | `HOME` — agent project workspace (`~/`)              |
| `/srv/coda-data/deployments` | `CODA_DEPLOYMENTS_HOME` — zcli/fly/railway XDG state |
| `/srv/coda-data/hermes`      | `HERMES_HOME` — Hermes config and secrets            |

GitHub OAuth tokens persist across container replacement through `T3CODE_HOME`, not
`HOME/.config/gh`. A leftover host-level `gh auth login` is a shared compatibility fallback only;
managed per-session OAuth records stay isolated and take precedence. Revoking a paired Coda
session also revokes that session's GitHub app token when possible.

On first boot after attaching the volume, `start.sh` copies any leftover state from the old
ephemeral `/home/zerops/*` paths when the destination is still empty.

Agent and terminal processes do not inherit `T3CODE_*`, `VITE_*`, or `ZEROPS_*`, so they cannot
treat this Coda host as their deploy target.

Git `user.name` / `user.email` for hosted commits live in `/srv/coda-data/coda/.gitconfig`
(`HOME`). If unset, Coda authors commits as `Coda <coda@users.noreply.github.com>` so they
still succeed. Operators or users can set a real identity from a Coda terminal with
`git config --global user.name` and `git config --global user.email`. Push and fetch use the
per-session GitHub OAuth token, not SSH keys.
