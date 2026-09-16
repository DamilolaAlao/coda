# Security Policy

## Reporting a vulnerability

Do not open a public issue for security reports.

Use GitHub's private vulnerability reporting:

https://github.com/DamilolaAlao/coda/security/advisories/new

Include the affected surface (web, server, desktop, mobile, hosted stack), a clear reproduction, impact, and any logs with secrets removed.

We will acknowledge complete reports and coordinate disclosure after a fix is available.

## Scope

This repository is an MIT-licensed Coda tree. Reports that belong here:

- The web, desktop, and mobile clients in this repo
- The Node WebSocket server and provider adapters
- The hosted stack documentation and deploy scripts in `deploy/zerops`

Vulnerabilities in T3 Tools-operated production (app.t3.codes, Coda Connect, t3.codes) should go to [security@ping.gg](mailto:security@ping.gg) as described in their [security policy](https://t3.codes).

## Secrets

Never commit pairing codes, GitHub client secrets, Zerops tokens, provider API keys, or live `~/.t3` / `.t3/userdata` databases. Use `deploy/zerops/.env.example` and GitHub Actions secrets. If a secret lands in git, rotate it before anything else.
