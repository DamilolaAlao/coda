# Contributing

Thanks for wanting to help. Coda is MIT-licensed and this tree is public.

Read [AGENTS.md](./AGENTS.md) before you change anything. It is the map of the
repo, the product constraints, and the language we use (environment, project,
thread, turn, provider, client).

Also read the [Code of Conduct](./CODE_OF_CONDUCT.md).

## What lands

Small, focused bug fixes.

Reliability and performance fixes.

Docs that match shipped behavior.

Tightly scoped maintenance that clearly improves the project.

## What usually does not

Large PRs that mix unrelated work.

Drive-by features that expand product scope.

Opinionated rewrites.

If the change is non-trivial, [open an issue](https://github.com/DamilolaAlao/coda/issues/new/choose)
first so we can agree on the shape.

## Pull requests

Keep the diff small. One concern per PR.

Explain what changed and why. Conventional commit titles, plain language:
`fix(web): new threads no longer spike CPU`.

UI changes need before/after images. Motion or timing needs a short video.

PRs are labeled with `vouch:*` and `size:*`. External contributors start as
`vouch:unvouched` until they are listed in [.github/VOUCHED.td](.github/VOUCHED.td).
That is a review-priority signal, not a ban.

Do not commit pairing codes, GitHub client secrets, provider keys, or live
`.t3` databases.

## Setup

Install the global `vp` CLI from [Vite+](https://viteplus.dev/guide/), then:

```bash
vp i
vp run typecheck
vp test run <files-you-touched>
```

Do not run repo-wide `vp check` or the full test suite unless a maintainer asks.
CI owns that.

Worktree state belongs in `<worktree>/.t3`. Never point a dev server at live
`~/.t3/userdata`.

## Upstream

This repository forks [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
`origin` is [DamilolaAlao/coda](https://github.com/DamilolaAlao/coda). On merge
conflicts, **this tree wins**.

```bash
git remote add upstream https://github.com/pingdotgg/t3code.git
chmod +x scripts/sync-upstream.sh
./scripts/sync-upstream.sh
```

Do not `reset --hard` to `upstream/main`. That would throw away the hosted
GitHub, landing, and deploy work in this fork.

## Security

Report vulnerabilities privately: [SECURITY.md](./SECURITY.md).
