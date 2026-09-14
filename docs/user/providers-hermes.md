# Hermes

[Hermes Agent](https://hermes-agent.nousresearch.com) is a Nous Research coding agent. T3 Code
talks to the `hermes` CLI over ACP and uses whatever model Hermes is already configured with.

## Install

On the machine that runs the T3 Code server:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

macOS and Windows can also use the Hermes desktop app from that site. T3 Code still needs the
`hermes` CLI on `PATH` (or an explicit binary path in Settings).

## Authenticate

Hermes does not use a T3 login. Connect a model provider in Hermes itself (Nous Portal, or your
own OpenAI-compatible endpoint). T3 Code then uses those runtime credentials.

After install, restart the T3 Code server so it can find `hermes`. Pick **Hermes** in the model
picker and start a thread.

## Default model

T3 Code uses Hermes's current default model. It does not invent extra profiles.

If the CLI is installed but not on the server `PATH`, set **Settings** → Hermes → **Binary path**
to the full path of the `hermes` binary.
