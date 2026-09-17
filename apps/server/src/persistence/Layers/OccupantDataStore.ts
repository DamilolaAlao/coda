/**
 * Best-effort per-occupant SQLite replica under userdata/occupants.
 * The host event store remains the source of truth; dispatch must not fail
 * if this copy is skipped.
 */
import { AuthSessionId, type OrchestrationEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "../../config.ts";
import { isSessionDataIsolationEnabled } from "../../auth/SessionDataIsolation.ts";

const OCCUPANT_ATTACH_ALIAS = "occupant_store";
const THREAD_COPY_TABLES = [
  "projection_threads",
  "projection_thread_messages",
  "projection_thread_activities",
  "projection_thread_sessions",
  "projection_turns",
  "projection_pending_approvals",
  "projection_thread_proposed_plans",
  "checkpoint_diff_blobs",
] as const;
const COPY_TABLES = [
  "orchestration_events",
  "orchestration_command_receipts",
  "projection_projects",
  ...THREAD_COPY_TABLES,
] as const;

export const occupantDirectoryName = (ownerId: string): string =>
  ownerId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "occupant";

export const occupantDatabasePath = (
  occupantsDir: string,
  ownerId: string,
  join: Path.Path["join"],
) => join(occupantsDir, occupantDirectoryName(ownerId), "state.sqlite");

const sqliteQuotedPath = (filePath: string): string => `'${filePath.replaceAll("'", "''")}'`;

const ownerFromPayload = (payload: unknown): AuthSessionId | null => {
  if (payload === null || typeof payload !== "object" || !("ownerSessionId" in payload)) {
    return null;
  }
  const value = (payload as { readonly ownerSessionId?: unknown }).ownerSessionId;
  return typeof value === "string" && value.length > 0 ? AuthSessionId.make(value) : null;
};

export class OccupantDataStore extends Context.Service<
  OccupantDataStore,
  {
    readonly databasePath: (ownerId: AuthSessionId) => string;
    readonly replicate: (events: ReadonlyArray<OrchestrationEvent>) => Effect.Effect<void>;
  }
>()("t3/persistence/OccupantDataStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { occupantsDir } = yield* ServerConfig;

  yield* fs.makeDirectory(occupantsDir, { recursive: true });
  yield* fs.chmod(occupantsDir, 0o700).pipe(Effect.catch(() => Effect.void));

  const databasePath = (ownerId: AuthSessionId) =>
    occupantDatabasePath(occupantsDir, ownerId, path.join);

  const ensureOccupantSchema = Effect.gen(function* () {
    const existing = yield* sql.unsafe<{ readonly name: string }>(
      `SELECT name FROM ${OCCUPANT_ATTACH_ALIAS}.sqlite_master WHERE type = 'table' AND name = 'orchestration_events' LIMIT 1`,
    ).unprepared;
    if (existing.length > 0) {
      return;
    }
    yield* Effect.forEach(
      COPY_TABLES,
      (table) =>
        sql.unsafe(
          `CREATE TABLE ${OCCUPANT_ATTACH_ALIAS}.${table} AS SELECT * FROM ${table} WHERE 0`,
        ).unprepared,
      { discard: true },
    );
  });

  const resolveOwner = (event: OrchestrationEvent) =>
    Effect.gen(function* () {
      const fromPayload = ownerFromPayload(event.payload);
      if (fromPayload !== null) {
        return fromPayload;
      }
      if (event.aggregateKind === "project") {
        const rows = yield* sql<{ readonly ownerSessionId: string | null }>`
          SELECT owner_session_id AS "ownerSessionId"
          FROM projection_projects
          WHERE project_id = ${event.aggregateId}
          LIMIT 1
        `;
        const owner = rows[0]?.ownerSessionId;
        return owner ? AuthSessionId.make(owner) : null;
      }
      const rows = yield* sql<{ readonly ownerSessionId: string | null }>`
        SELECT owner_session_id AS "ownerSessionId"
        FROM projection_threads
        WHERE thread_id = ${event.aggregateId}
        LIMIT 1
      `;
      const owner = rows[0]?.ownerSessionId;
      return owner ? AuthSessionId.make(owner) : null;
    });

  const copyEvent = (event: OrchestrationEvent) =>
    Effect.gen(function* () {
      yield* sql`
        DELETE FROM occupant_store.orchestration_events
        WHERE event_id = ${event.eventId}
      `;
      yield* sql`
        INSERT INTO occupant_store.orchestration_events
        SELECT * FROM orchestration_events
        WHERE event_id = ${event.eventId}
      `;
      if (event.commandId !== null) {
        yield* sql`
          DELETE FROM occupant_store.orchestration_command_receipts
          WHERE command_id = ${event.commandId}
        `;
        yield* sql`
          INSERT INTO occupant_store.orchestration_command_receipts
          SELECT * FROM orchestration_command_receipts
          WHERE command_id = ${event.commandId}
        `;
      }
      if (event.aggregateKind === "project") {
        yield* sql`
          DELETE FROM occupant_store.projection_projects
          WHERE project_id = ${event.aggregateId}
        `;
        yield* sql`
          INSERT INTO occupant_store.projection_projects
          SELECT * FROM projection_projects
          WHERE project_id = ${event.aggregateId}
        `;
        return;
      }
      const threadId = String(event.aggregateId).replaceAll("'", "''");
      yield* sql`
        DELETE FROM occupant_store.projection_projects
        WHERE project_id IN (
          SELECT project_id FROM projection_threads
          WHERE thread_id = ${event.aggregateId}
        )
      `;
      yield* sql`
        INSERT INTO occupant_store.projection_projects
        SELECT p.* FROM projection_projects p
        INNER JOIN projection_threads t ON t.project_id = p.project_id
        WHERE t.thread_id = ${event.aggregateId}
      `;
      yield* Effect.forEach(
        THREAD_COPY_TABLES,
        (table) =>
          Effect.gen(function* () {
            yield* sql.unsafe(
              `DELETE FROM ${OCCUPANT_ATTACH_ALIAS}.${table} WHERE thread_id = '${threadId}'`,
            ).unprepared;
            yield* sql.unsafe(
              `INSERT INTO ${OCCUPANT_ATTACH_ALIAS}.${table} SELECT * FROM ${table} WHERE thread_id = '${threadId}'`,
            ).unprepared;
          }),
        { discard: true },
      );
    });

  const copyIntoOccupant = (ownerId: AuthSessionId, events: ReadonlyArray<OrchestrationEvent>) =>
    Effect.gen(function* () {
      const dbPath = databasePath(ownerId);
      yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });
      yield* fs.chmod(path.dirname(dbPath), 0o700).pipe(Effect.catch(() => Effect.void));
      yield* sql.unsafe(`ATTACH DATABASE ${sqliteQuotedPath(dbPath)} AS ${OCCUPANT_ATTACH_ALIAS}`)
        .unprepared;
      yield* ensureOccupantSchema;
      yield* Effect.forEach(events, copyEvent, { discard: true });
    }).pipe(
      Effect.ensuring(
        sql.unsafe(`DETACH DATABASE ${OCCUPANT_ATTACH_ALIAS}`).unprepared.pipe(Effect.ignore),
      ),
    );

  const replicate: OccupantDataStore["Service"]["replicate"] = (events) => {
    if (!isSessionDataIsolationEnabled() || events.length === 0) {
      return Effect.void;
    }
    return Effect.gen(function* () {
      const grouped = new Map<AuthSessionId, OrchestrationEvent[]>();
      for (const event of events) {
        const owner = yield* resolveOwner(event);
        if (owner === null) {
          continue;
        }
        const bucket = grouped.get(owner);
        if (bucket === undefined) {
          grouped.set(owner, [event]);
        } else {
          bucket.push(event);
        }
      }
      yield* Effect.forEach(
        Array.from(grouped.entries()),
        ([ownerId, ownedEvents]) => copyIntoOccupant(ownerId, ownedEvents),
        { discard: true, concurrency: 1 },
      );
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("occupant sqlite replica skipped").pipe(
          Effect.annotateLogs({
            eventCount: events.length,
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
        ),
      ),
      Effect.ignore,
    );
  };

  return OccupantDataStore.of({
    databasePath,
    replicate,
  });
});

export const layer = Layer.effect(OccupantDataStore, make);
export const layerLive = layer;
