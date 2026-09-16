# Session data isolation

> For maintainers. Using Coda? See [docs/user](../user/).

Each GitHub account is a private occupant of the environment. Sign in with GitHub
(or a one-time pairing link). Occupancy is that GitHub account (`github:<id>`). Client snapshots, search, counts, live streams,
file/git/terminal RPCs, and create commands only see projects and threads owned by that
occupant. Unowned (legacy) rows are hidden from clients. Server-side reactors still see
the full read model because they do not set `ClientSessionScope`.

Several devices can share the same GitHub account and therefore the same projects. Logging
out revokes **this device session** and clears its cookie; it does not delete GitHub-owned
projects. Rows created before OAuth (owned by the pairing session id) are claimed by that
GitHub occupant when OAuth completes.

This is on by default. Classic Coda sharing (every pairing sees the same projects) requires
`T3CODE_SESSION_DATA_ISOLATION=0` (also `false` / `off` / `no`).

Do not point this at the developer’s live `~/.t3` environment.

## What it isolates

- Shell and archived-shell snapshots
- Command read models used by client dispatch and the HTTP orchestration snapshot
- Thread detail snapshots, search, diffs, checkpoint context, and per-session counts
- Live shell events (a per-connection visibility gate; unknown aggregate kinds are denied)
- `project.create` / `thread.create` ownership (the authenticated occupancy overwrites any client
  value; occupancy is `github:<id>` after OAuth, otherwise the pairing session)
- Client session list / revoke-others (same GitHub occupant only)
- Logout of the current device session (`POST /api/auth/logout`)
- Workspace file list/search/read/write, git/VCS, review diffs, and terminals (cwd must sit in an
  owned project or worktree; thread RPCs 404 if the thread is not owned)
- Filesystem browse of another session’s workspace root (treated as not found; sibling folders
  used to create a new project stay visible)

## What it does not isolate

- The event log, command receipts, and projection tables themselves (one SQLite file)
- Provider processes and the host machine
- GitHub OAuth tokens (still stored per pairing session via `GitHubTenant`; occupancy is the GitHub
  user id)
- Opening a folder in an external editor, cloning a repository to a new path, and some
  background-app stop/restart-by-id paths

Two sessions can therefore own two project records that point at the same `workspaceRoot`. Disk
conflicts are accepted; the uniqueness invariant only applies among projects the calling session
can see.

## Boundary

The decider stays IO-free. Isolation is:

1. Stamp `ownerSessionId` on create commands at the WS/HTTP edge (`github:<id>` after OAuth, else
   the pairing session id).
2. Persist it on `project.created` / `thread.created` and on the projection rows.
3. Filter snapshot queries when `ClientSessionScope` is set. Unowned rows are not visible to
   clients.
4. Gate live shell events after the filtered snapshot seeds visible aggregate IDs.
5. Reject file/git/terminal RPCs whose cwd or thread is not owned.
6. On GitHub OAuth, rewrite this pairing session’s projection `owner_session_id` from the session
   id to `github:<id>`.

Reactors and other server-side work do not set `ClientSessionScope`, so they still see the full
read model. Unauthorized client access looks like not-found, not forbidden.

Opt out with `T3CODE_SESSION_DATA_ISOLATION=0`. Any other value, including unset, keeps isolation
on.
