# Background apps

Coda can keep long-running workspace processes — dev servers, watchers, and similar apps — in a
dedicated Apps surface instead of occupying a visible terminal.

## Start an app

From **Project settings** or the scripts menu, edit a project action and turn on **Run as
background app**. The next time you run that action, Coda starts it as a managed app: it keeps the
exact command, working directory, and environment, and it does not take over the terminal drawer.

Agents can also start a background app with the background-app tools. Those launches use the same
manager, so you can stop, restart, or inspect them later from the Apps panel.

A process that you start yourself in a terminal can still show up as a **discovered** app when Coda
can prove a listening port belongs to that terminal. HTTP APIs that only speak JSON (or 404 on `/`)
are included here; the preview panel still prefers HTML documents. Discovered apps can be opened and
usually stopped. Restart is only available for managed apps, because Coda never reconstructs a
command from process listings. A listener that is not owned by a Coda terminal can still appear so
you can open it, but Stop and logs stay unavailable.

## Control a running app

Open **Apps** from the right-panel launcher, the thread header, the command palette (**Toggle
Apps**), or `mod+shift+a`. Mobile has the same list under the thread action menu as **Background
Apps**.

For each app you can:

- See status (**Starting…**, **Running**, **Stopping…**, **Stopped**, **Failed**), uptime, and listening ports
- Read a bounded log (the same output the hidden terminal kept)
- Open the preview when a URL is known
- Restart a managed app with the original command
- Stop a managed app, or a discovered listener that Coda knows is owned by a terminal

After Coda itself restarts, previously running apps are shown as stopped. Their launch details are
kept, so you can start a managed app again by hand. Process IDs are not reused across restarts.
