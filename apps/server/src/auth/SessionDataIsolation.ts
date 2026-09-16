import {
  AuthSessionId,
  isolationOwnerId,
  type OrchestrationCommand,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import {
  isUncPath,
  isWindowsDrivePath,
  normalizeProjectPathForComparison,
} from "@t3tools/shared/path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const DISABLED_VALUES = new Set(["0", "false", "no", "off"]);

export function isSessionDataIsolationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.T3CODE_SESSION_DATA_ISOLATION?.trim().toLowerCase();
  if (raw === undefined || raw.length === 0) {
    return true;
  }
  return !DISABLED_VALUES.has(raw);
}

export type ClientSessionOccupancy = {
  readonly sessionId: AuthSessionId;
  readonly ownerId: AuthSessionId;
};

export function clientSessionOccupancy(session: {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
}): ClientSessionOccupancy {
  return {
    sessionId: session.sessionId,
    ownerId: isolationOwnerId(session),
  };
}

export class ClientSessionScope extends Context.Reference<ClientSessionOccupancy | null>(
  "t3/auth/ClientSessionScope",
  { defaultValue: () => null },
) {}

export const isolationOwnerSessionId: Effect.Effect<AuthSessionId | null> = Effect.gen(
  function* () {
    if (!isSessionDataIsolationEnabled()) {
      return null;
    }
    const scope = yield* ClientSessionScope;
    return scope?.ownerId ?? null;
  },
);

export function sessionCanSeeOwner(
  occupancyId: AuthSessionId | null,
  ownerSessionId: AuthSessionId | null | undefined,
): boolean {
  if (!isSessionDataIsolationEnabled() || occupancyId === null) {
    return true;
  }
  return ownerSessionId === occupancyId;
}

export const clientCanSeeProjectedOwner = (
  ownerSessionId: AuthSessionId | null | undefined,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const scope = yield* ClientSessionScope;
    return sessionCanSeeOwner(scope?.ownerId ?? null, ownerSessionId);
  });

function projectedOwnerSessionId(row: object): AuthSessionId | null | undefined {
  if (!("ownerSessionId" in row)) {
    return undefined;
  }
  return (row as { readonly ownerSessionId?: AuthSessionId | null }).ownerSessionId;
}

export function workspacePathIsWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeProjectPathForComparison(path);
  const normalizedRoot = normalizeProjectPathForComparison(root);
  if (normalizedPath.length === 0 || normalizedRoot.length === 0) {
    return false;
  }
  if (normalizedPath === normalizedRoot) {
    return true;
  }
  const separator =
    isUncPath(normalizedRoot) || isWindowsDrivePath(normalizedRoot) ? "\\" : "/";
  const prefix = normalizedRoot.endsWith(separator)
    ? normalizedRoot
    : `${normalizedRoot}${separator}`;
  return normalizedPath.startsWith(prefix);
}

export function workspacePathIsWithinAny(
  path: string,
  roots: ReadonlyArray<string>,
): boolean {
  return roots.some((root) => workspacePathIsWithinRoot(path, root));
}

export function restrictProjectedRows<
  Project extends { readonly projectId: unknown },
  Thread extends { readonly threadId: unknown; readonly projectId: unknown },
>(
  projectRows: ReadonlyArray<Project>,
  threadRows: ReadonlyArray<Thread>,
  occupancyId: AuthSessionId | null,
): {
  readonly projectRows: ReadonlyArray<Project>;
  readonly threadRows: ReadonlyArray<Thread>;
} {
  if (!isSessionDataIsolationEnabled() || occupancyId === null) {
    return { projectRows, threadRows };
  }
  const visibleProjects = projectRows.filter((row) =>
    sessionCanSeeOwner(occupancyId, projectedOwnerSessionId(row)),
  );
  const visibleProjectIds = new Set(visibleProjects.map((row) => row.projectId));
  return {
    projectRows: visibleProjects,
    threadRows: threadRows.filter(
      (row) =>
        sessionCanSeeOwner(occupancyId, projectedOwnerSessionId(row)) &&
        visibleProjectIds.has(row.projectId),
    ),
  };
}

export const restrictProjectedRowsForClient = <
  Project extends { readonly projectId: unknown },
  Thread extends { readonly threadId: unknown; readonly projectId: unknown },
>(
  projectRows: ReadonlyArray<Project>,
  threadRows: ReadonlyArray<Thread>,
): Effect.Effect<{
  readonly projectRows: ReadonlyArray<Project>;
  readonly threadRows: ReadonlyArray<Thread>;
}> =>
  Effect.gen(function* () {
    const scope = yield* ClientSessionScope;
    return restrictProjectedRows(projectRows, threadRows, scope?.ownerId ?? null);
  });

export function stampOwnerOnCreateCommand<Command extends OrchestrationCommand>(
  command: Command,
  occupancyId: AuthSessionId,
): Command {
  if (!isSessionDataIsolationEnabled()) {
    return command;
  }
  if (command.type !== "project.create" && command.type !== "thread.create") {
    return command;
  }
  return {
    ...command,
    ownerSessionId: occupancyId,
  };
}

export class SessionVisibilityGate {
  readonly #occupancyId: AuthSessionId;
  readonly #projectIds = new Set<string>();
  readonly #threadIds = new Set<string>();

  constructor(occupancyId: AuthSessionId) {
    this.#occupancyId = occupancyId;
  }

  seed(input: {
    readonly projectIds: Iterable<string>;
    readonly threadIds: Iterable<string>;
  }): void {
    for (const id of input.projectIds) {
      this.#projectIds.add(id);
    }
    for (const id of input.threadIds) {
      this.#threadIds.add(id);
    }
  }

  admit(event: OrchestrationEvent): boolean {
    if (!isSessionDataIsolationEnabled()) {
      return true;
    }
    if (event.type === "project.created") {
      if (!sessionCanSeeOwner(this.#occupancyId, event.payload.ownerSessionId)) {
        return false;
      }
      this.#projectIds.add(event.payload.projectId);
      return true;
    }
    if (event.type === "thread.created") {
      if (!sessionCanSeeOwner(this.#occupancyId, event.payload.ownerSessionId)) {
        return false;
      }
      this.#threadIds.add(event.payload.threadId);
      return true;
    }
    if (event.aggregateKind === "project") {
      return this.#projectIds.has(event.aggregateId);
    }
    if (event.aggregateKind === "thread") {
      return this.#threadIds.has(event.aggregateId);
    }
    return false;
  }
}

export const claimProjectionOccupancy = (
  fromOwner: AuthSessionId,
  toOwner: AuthSessionId,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (fromOwner === toOwner) {
      return;
    }
    const sql = yield* Effect.serviceOption(SqlClient.SqlClient);
    if (Option.isNone(sql)) {
      return;
    }
    yield* sql.value`
      UPDATE projection_projects
      SET owner_session_id = ${toOwner}
      WHERE deleted_at IS NULL
        AND owner_session_id = ${fromOwner}
    `;
    yield* sql.value`
      UPDATE projection_threads
      SET owner_session_id = ${toOwner}
      WHERE deleted_at IS NULL
        AND owner_session_id = ${fromOwner}
    `;
  }).pipe(Effect.ignore, Effect.asVoid);
