import {
  AuthSessionId,
  ThreadId,
  type FilesystemBrowseEntry,
  type FilesystemBrowseResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  ClientSessionScope,
  isSessionDataIsolationEnabled,
  workspacePathIsWithinAny,
} from "./SessionDataIsolation.ts";

export class SessionWorkspaceAccessDenied extends Schema.TaggedErrorClass<SessionWorkspaceAccessDenied>()(
  "SessionWorkspaceAccessDenied",
  {
    path: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace not found: ${this.path}`;
  }
}

export class SessionThreadAccessDenied extends Schema.TaggedErrorClass<SessionThreadAccessDenied>()(
  "SessionThreadAccessDenied",
  {
    threadId: Schema.String,
  },
) {
  override get message(): string {
    return `Thread not found: ${this.threadId}`;
  }
}

const WorkspaceAccessPathRow = Schema.Struct({
  path: Schema.String,
});

const IsolationOwnerLookup = Schema.Struct({
  ownerSessionId: AuthSessionId,
});

const listProjectWorkspaceAccessPathRows = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: IsolationOwnerLookup,
    Result: WorkspaceAccessPathRow,
    execute: ({ ownerSessionId }) =>
      sql`
        SELECT workspace_root AS "path"
        FROM projection_projects
        WHERE deleted_at IS NULL
          AND owner_session_id = ${ownerSessionId}
      `,
  });

const listThreadWorkspaceAccessPathRows = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: IsolationOwnerLookup,
    Result: WorkspaceAccessPathRow,
    execute: ({ ownerSessionId }) =>
      sql`
        SELECT worktree_path AS "path"
        FROM projection_threads
        WHERE deleted_at IS NULL
          AND worktree_path IS NOT NULL
          AND worktree_path != ''
          AND owner_session_id = ${ownerSessionId}
      `,
  });

const listForeignProjectWorkspaceAccessPathRows = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: IsolationOwnerLookup,
    Result: WorkspaceAccessPathRow,
    execute: ({ ownerSessionId }) =>
      sql`
        SELECT workspace_root AS "path"
        FROM projection_projects
        WHERE deleted_at IS NULL
          AND (owner_session_id IS NULL OR owner_session_id != ${ownerSessionId})
      `,
  });

const listForeignThreadWorkspaceAccessPathRows = (sql: SqlClient.SqlClient) =>
  SqlSchema.findAll({
    Request: IsolationOwnerLookup,
    Result: WorkspaceAccessPathRow,
    execute: ({ ownerSessionId }) =>
      sql`
        SELECT worktree_path AS "path"
        FROM projection_threads
        WHERE deleted_at IS NULL
          AND worktree_path IS NOT NULL
          AND worktree_path != ''
          AND (owner_session_id IS NULL OR owner_session_id != ${ownerSessionId})
      `,
  });

const collectAccessPaths = (
  ownerSessionId: AuthSessionId,
  listProjectRows: typeof listProjectWorkspaceAccessPathRows,
  listThreadRows: typeof listThreadWorkspaceAccessPathRows,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const projectRows = yield* listProjectRows(sql)({ ownerSessionId });
    const threadRows = yield* listThreadRows(sql)({ ownerSessionId });
    return [...projectRows, ...threadRows].map((row) => row.path);
  });

const listOwnedWorkspaceAccessPaths = (ownerSessionId: AuthSessionId) =>
  collectAccessPaths(
    ownerSessionId,
    listProjectWorkspaceAccessPathRows,
    listThreadWorkspaceAccessPathRows,
  ).pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));

const listForeignWorkspaceAccessPaths = (ownerSessionId: AuthSessionId, path: string) =>
  collectAccessPaths(
    ownerSessionId,
    listForeignProjectWorkspaceAccessPathRows,
    listForeignThreadWorkspaceAccessPathRows,
  ).pipe(Effect.mapError(() => new SessionWorkspaceAccessDenied({ path })));

export const requireOwnedWorkspacePath = Effect.fn("requireOwnedWorkspacePath")(function* (
  cwd: string,
) {
  if (!isSessionDataIsolationEnabled()) {
    return;
  }
  const scope = yield* ClientSessionScope;
  if (scope === null) {
    return;
  }
  const paths = yield* listOwnedWorkspaceAccessPaths(scope.ownerId);
  if (!workspacePathIsWithinAny(cwd, paths)) {
    return yield* new SessionWorkspaceAccessDenied({ path: cwd });
  }
});

export const requireBrowsableWorkspacePath = Effect.fn("requireBrowsableWorkspacePath")(
  function* (path: string) {
    if (!isSessionDataIsolationEnabled()) {
      return;
    }
    const scope = yield* ClientSessionScope;
    if (scope === null) {
      return;
    }
    const foreign = yield* listForeignWorkspaceAccessPaths(scope.ownerId, path);
    if (workspacePathIsWithinAny(path, foreign)) {
      return yield* new SessionWorkspaceAccessDenied({ path });
    }
  },
);

export const hideForeignBrowseEntries = (
  entries: ReadonlyArray<FilesystemBrowseEntry>,
  foreignRoots: ReadonlyArray<string>,
): ReadonlyArray<FilesystemBrowseEntry> =>
  entries.filter((entry) => !workspacePathIsWithinAny(entry.fullPath, foreignRoots));

export const isolateFilesystemBrowseResult = Effect.fn("isolateFilesystemBrowseResult")(
  function* (result: FilesystemBrowseResult) {
    if (!isSessionDataIsolationEnabled()) {
      return result;
    }
    const scope = yield* ClientSessionScope;
    if (scope === null) {
      return result;
    }
    yield* requireBrowsableWorkspacePath(result.parentPath);
    const foreign = yield* listForeignWorkspaceAccessPaths(scope.ownerId, result.parentPath);
    return {
      parentPath: result.parentPath,
      entries: hideForeignBrowseEntries(result.entries, foreign),
    } satisfies FilesystemBrowseResult;
  },
);

export const withOwnedWorkspacePath = <A, E, R>(
  cwd: string,
  onDenied: (path: string) => E,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient | ClientSessionScope> =>
  requireOwnedWorkspacePath(cwd).pipe(
    Effect.mapError((denied) => onDenied(denied.path)),
    Effect.andThen(effect),
  );

export const withOwnedWorkspacePathStream = <A, E, R>(
  cwd: string,
  onDenied: (path: string) => E,
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R | SqlClient.SqlClient | ClientSessionScope> =>
  Stream.fromEffect(
    requireOwnedWorkspacePath(cwd).pipe(Effect.mapError((denied) => onDenied(denied.path))),
  ).pipe(Stream.flatMap(() => stream));

export const threadIsVisibleToClient = Effect.fn("threadIsVisibleToClient")(function* (
  threadId: string,
) {
  if (!isSessionDataIsolationEnabled()) {
    return true;
  }
  const scope = yield* ClientSessionScope;
  if (scope === null) {
    return true;
  }
  const snapshotQuery = yield* ProjectionSnapshotQuery;
  const thread = yield* snapshotQuery.getThreadShellById(ThreadId.make(threadId)).pipe(
    Effect.map(Option.isSome),
    Effect.orElseSucceed(() => false),
  );
  return thread;
});

export const requireVisibleThread = Effect.fn("requireVisibleThread")(function* (threadId: string) {
  if (yield* threadIsVisibleToClient(threadId)) {
    return;
  }
  return yield* new SessionThreadAccessDenied({ threadId });
});

export const withVisibleThread = <A, E, R>(
  threadId: string,
  onDenied: (threadId: string) => E,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ProjectionSnapshotQuery | ClientSessionScope> =>
  requireVisibleThread(threadId).pipe(
    Effect.mapError((denied) => onDenied(denied.threadId)),
    Effect.andThen(effect),
  );

export const withVisibleThreadStream = <A, E, R>(
  threadId: string,
  onDenied: (threadId: string) => E,
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R | ProjectionSnapshotQuery | ClientSessionScope> =>
  Stream.fromEffect(
    requireVisibleThread(threadId).pipe(Effect.mapError((denied) => onDenied(denied.threadId))),
  ).pipe(Stream.flatMap(() => stream));
