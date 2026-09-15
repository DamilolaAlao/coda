# Hermes

[Hermes Agent](https://hermes-agent.nousresearch.com) is a Nous Research coding agent. Coda
talks to the `hermes` CLI over ACP. New threads and titles default to Hermes on
[OpenCode Go](https://opencode.ai/docs/providers/#opencode-go), using **Kimi K3**.

## Install

On the machine that runs the Coda server:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

macOS and Windows can also use the Hermes desktop app from that site. Coda still needs the
`hermes` CLI on `PATH` (or an explicit binary path in Settings).

## Authenticate with OpenCode Go

1. Subscribe and copy an API key from [opencode.ai/auth](https://opencode.ai/auth).
2. In Coda, open **Settings** → Hermes and paste it into **OpenCode Go API key**.

Coda passes that key to Hermes as `OPENCODE_GO_API_KEY`. You can instead put the same key in
`~/.hermes/.env` and leave the T3 field blank.

Point Hermes at OpenCode Go in `~/.hermes/config.yaml` so ACP uses that catalog (T3 cannot pass
`--provider` to `hermes acp`):

```yaml
model:
  default: kimi-k3
  provider: opencode-go
```

Leave **OpenCode Go endpoint** blank unless you proxy Go. The default is
`https://opencode.ai/zen/go/v1`.

Hermes does not use a T3 login. Other Hermes providers (Nous Portal, OpenRouter, and so on) still
work if you configure them in Hermes itself instead of OpenCode Go.

After install, restart the Coda server so it can find `hermes`. Pick **Hermes** in the model
picker if a thread is still on another provider.

## Default model

New work uses **Kimi K3** (`kimi-k3`). Hermes may list more OpenCode Go models after ACP starts.

If the CLI is installed but not on the server `PATH`, set **Settings** → Hermes → **Binary path**
to the full path of the `hermes` binary.
