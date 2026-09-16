# Background apps

The Apps surface is a facade over existing process machinery. It does not spawn a second
subprocess stack.

## Ownership

`BackgroundAppService` in `apps/server/src/backgroundApps/` stores a launch specification
(`command`, `cwd`, env, project/thread/script ids, optional preview URL) and allocates a dedicated
PTY through `TerminalManager`. Those PTYs use ids prefixed with `app-` and are hidden from the
terminal UI. Restart writes the stored command again; it never rebuilds a command from `ps`.

Discovered apps come from `PortDiscovery` when a listener speaks HTTP. HTML documents stay
preview-first; JSON and other HTTP APIs are included for the Apps surface. Terminal-owned
listeners can be stopped. Unverified PIDs are never signaled. Listeners without a Coda terminal
can still appear as openable discovered apps.

## Persistence

Definitions live in `T3CODE_HOME` userdata as `background-apps.json`, following the preview session
file pattern. The file stores launch specs and last-known status. It does not store PIDs. On server
or container restart, previously `starting` / `running` / `stopping` entries are reconciled to
`stopped` (failed stays failed) and remain restartable by the user.

Logs reuse bounded terminal history. There is no separate app log store, and the WebSocket log
stream is the terminal attach stream.

## Wire format

Contracts live in `packages/contracts/src/backgroundApps.ts`. RPCs are `backgroundApps.list`,
`.start`, `.stop`, `.restart`, `.logs`, and `subscribeBackgroundApps`. Status and logs require
orchestration read scope; mutations require terminal operate scope. Shared client atoms live in
`packages/client-runtime/src/state/backgroundApps.ts` and invalidate per environment, staying
subscribed across reconnects.
