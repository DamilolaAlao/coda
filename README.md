# Coda

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Coda is an "agent harness control surface". It enables control of the agents on your machine with a web app ([hosted](https://www.iointel.dev)), a local server, and [Electron-based desktop](https://github.com/DamilolaAlao/coda) and mobile clients.

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, Hermes, and OpenCode. If they're set up on your computer, Coda can control them.

## "Wait, what are you selling me?"

Nothing. We built Coda because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

> [!WARNING]
> Coda currently supports Codex, Claude, Cursor, Grok Build, Hermes, and OpenCode. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - Hermes: install [Hermes Agent](https://hermes-agent.nousresearch.com) and configure a model provider
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Try it out (install-free)

The easiest way to test Coda is to run the server in your terminal (requires Node.js 22.16+, 23.11+, or 24.10+):

```bash
npx t3@latest
```

This will launch Coda's backend on your machine as well as the local web app to control your agents.

Tip: Use `npx t3@latest --help` for the full CLI reference.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/DamilolaAlao/coda/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

Stable:

```bash
yay -S t3code-bin
```

Nightly:

```bash
yay -S t3code-nightly-bin
```

The AUR packaging is maintained in this repository under [`packaging/aur`](./packaging/aur).

## Some notes

We are very early in this project. Expect bugs.

This repository is MIT-licensed. Small, focused fixes and docs are welcome. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) before
opening a PR. Security reports go through [SECURITY.md](./SECURITY.md), not public issues.

Coda was created by [T3 Tools](https://t3.codes) as [T3 Code](https://github.com/pingdotgg/t3code).
This repository is a public fork. **Changes in this tree take precedence over upstream.**
Hosted instance: [iointel.dev](https://www.iointel.dev).

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Customize a project icon](./docs/user/project-settings.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- Linux: [run Coda as a background service](./docs/user/background-service.md)
- Self-host on Zerops: [hosted stack](./docs/operations/hosted-zerops.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## Contributing from source

### Install `vp`

Coda uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).

License: [MIT](./LICENSE).
