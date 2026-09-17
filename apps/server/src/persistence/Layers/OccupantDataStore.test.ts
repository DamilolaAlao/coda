import { DatabaseSync } from "node:sqlite";

import {
  AuthSessionId,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig } from "../../config.ts";
import {
  occupantDirectoryName,
  OccupantDataStore,
  layer as OccupantDataStoreLayer,
} from "./OccupantDataStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "./OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { OrchestrationEventStore } from "../Services/OrchestrationEventStore.ts";
import { OrchestrationEngineLive } from "../../orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "../../orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "../../orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationProjectionPipeline } from "../../orchestration/Services/ProjectionPipeline.ts";
import * as ThreadBackgroundLiveness from "../../orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../../orchestration/ThreadPlanProgress.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";

const ownerA = AuthSessionId.make("github:111");
const ownerB = AuthSessionId.make("github:222");
const ownerOff = AuthSessionId.make("github:off");

const withIsolationFlag = <A, E, R>(
  value: string | undefined,
  run: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.T3CODE_SESSION_DATA_ISOLATION;
      if (value === undefined) {
        delete process.env.T3CODE_SESSION_DATA_ISOLATION;
      } else {
        process.env.T3CODE_SESSION_DATA_ISOLATION = value;
      }
      return previous;
    }),
    () => run,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env.T3CODE_SESSION_DATA_ISOLATION;
        } else {
          process.env.T3CODE_SESSION_DATA_ISOLATION = previous;
        }
      }),
  );

const readOccupantEventIds = (dbPath: string): ReadonlyArray<string> => {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return database
      .prepare("SELECT event_id AS eventId FROM orchestration_events ORDER BY sequence")
      .all()
      .map((row) => String((row as { readonly eventId: string }).eventId));
  } finally {
    database.close();
  }
};

const OccupantStoreLayer = OccupantDataStoreLayer.pipe(
  Layer.provideMerge(OrchestrationProjectionPipelineLive),
  Layer.provideMerge(OrchestrationEventStoreLive),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-occupant-store-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const OccupantEngineLayer = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(ThreadBackgroundLiveness.layer),
  Layer.provide(ThreadPlanProgress.layer),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(OccupantDataStoreLayer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-occupant-engine-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

it("sanitizes occupant directory names", () => {
  assert.equal(occupantDirectoryName("github:12345"), "github-12345");
  assert.equal(occupantDirectoryName("GitHub:ABC/../x"), "github-abc-x");
  assert.equal(occupantDirectoryName("@@@"), "occupant");
});

it.layer(OccupantStoreLayer)("OccupantDataStore", (it) => {
  it.effect("copies an owned project into that occupant sqlite and leaves others out", () =>
    withIsolationFlag(
      undefined,
      Effect.gen(function* () {
        const store = yield* OccupantDataStore;
        const eventStore = yield* OrchestrationEventStore;
        const pipeline = yield* OrchestrationProjectionPipeline;
        const now = "2026-01-01T00:00:00.000Z";

        const owned = yield* eventStore.append({
          type: "project.created",
          eventId: EventId.make("evt-occupant-a"),
          aggregateKind: "project",
          aggregateId: ProjectId.make("project-occupant-a"),
          occurredAt: now,
          commandId: CommandId.make("cmd-occupant-a"),
          causationEventId: null,
          correlationId: CommandId.make("cmd-occupant-a"),
          metadata: {},
          payload: {
            projectId: ProjectId.make("project-occupant-a"),
            title: "Owner A",
            workspaceRoot: "/tmp/project-occupant-a",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
            ownerSessionId: ownerA,
          },
        });
        const foreign = yield* eventStore.append({
          type: "project.created",
          eventId: EventId.make("evt-occupant-b"),
          aggregateKind: "project",
          aggregateId: ProjectId.make("project-occupant-b"),
          occurredAt: now,
          commandId: CommandId.make("cmd-occupant-b"),
          causationEventId: null,
          correlationId: CommandId.make("cmd-occupant-b"),
          metadata: {},
          payload: {
            projectId: ProjectId.make("project-occupant-b"),
            title: "Owner B",
            workspaceRoot: "/tmp/project-occupant-b",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
            ownerSessionId: ownerB,
          },
        });

        yield* pipeline.projectEvent(owned);
        yield* pipeline.projectEvent(foreign);
        yield* store.replicate([owned, foreign]);

        const ownedPath = store.databasePath(ownerA);
        const foreignPath = store.databasePath(ownerB);
        assert.deepEqual(readOccupantEventIds(ownedPath), ["evt-occupant-a"]);
        assert.deepEqual(readOccupantEventIds(foreignPath), ["evt-occupant-b"]);

        const ownedDatabase = new DatabaseSync(ownedPath, { readOnly: true });
        try {
          const projects = ownedDatabase
            .prepare("SELECT project_id AS projectId FROM projection_projects")
            .all()
            .map((row) => String((row as { readonly projectId: string }).projectId));
          assert.deepEqual(projects, ["project-occupant-a"]);
        } finally {
          ownedDatabase.close();
        }
      }),
    ),
  );

  it.effect("does not write an occupant database when isolation is off", () =>
    withIsolationFlag(
      "0",
      Effect.gen(function* () {
        const store = yield* OccupantDataStore;
        const eventStore = yield* OrchestrationEventStore;
        const pipeline = yield* OrchestrationProjectionPipeline;
        const fs = yield* FileSystem.FileSystem;
        const now = "2026-01-01T00:00:00.000Z";

        const created = yield* eventStore.append({
          type: "project.created",
          eventId: EventId.make("evt-occupant-off"),
          aggregateKind: "project",
          aggregateId: ProjectId.make("project-occupant-off"),
          occurredAt: now,
          commandId: CommandId.make("cmd-occupant-off"),
          causationEventId: null,
          correlationId: CommandId.make("cmd-occupant-off"),
          metadata: {},
          payload: {
            projectId: ProjectId.make("project-occupant-off"),
            title: "Isolation Off",
            workspaceRoot: "/tmp/project-occupant-off",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
            ownerSessionId: ownerOff,
          },
        });
        yield* pipeline.projectEvent(created);
        yield* store.replicate([created]);

        assert.equal(yield* fs.exists(store.databasePath(ownerOff)), false);
      }),
    ),
  );

  it.effect("swallows replica failures instead of throwing", () =>
    withIsolationFlag(
      undefined,
      Effect.gen(function* () {
        const store = yield* OccupantDataStore;
        const eventStore = yield* OrchestrationEventStore;
        const pipeline = yield* OrchestrationProjectionPipeline;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { occupantsDir } = yield* ServerConfig;
        const now = "2026-01-01T00:00:00.000Z";
        const brokenOwner = AuthSessionId.make("github:broken");

        yield* fs.writeFileString(
          path.join(occupantsDir, occupantDirectoryName(brokenOwner)),
          "nope",
        );

        const created = yield* eventStore.append({
          type: "project.created",
          eventId: EventId.make("evt-occupant-broken"),
          aggregateKind: "project",
          aggregateId: ProjectId.make("project-occupant-broken"),
          occurredAt: now,
          commandId: CommandId.make("cmd-occupant-broken"),
          causationEventId: null,
          correlationId: CommandId.make("cmd-occupant-broken"),
          metadata: {},
          payload: {
            projectId: ProjectId.make("project-occupant-broken"),
            title: "Broken",
            workspaceRoot: "/tmp/project-occupant-broken",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
            ownerSessionId: brokenOwner,
          },
        });
        yield* pipeline.projectEvent(created);
        yield* store.replicate([created]);
      }),
    ),
  );
});

it.layer(OccupantEngineLayer)("OccupantDataStore via engine dispatch", (it) => {
  it.effect("replicates after a successful owned project.create", () =>
    withIsolationFlag(
      undefined,
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        const store = yield* OccupantDataStore;

        yield* engine.dispatch({
          type: "project.create",
          commandId: CommandId.make("cmd-occupant-engine-create"),
          projectId: ProjectId.make("project-occupant-engine"),
          title: "Engine Occupant",
          workspaceRoot: "/tmp/project-occupant-engine",
          defaultModelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          ownerSessionId: ownerA,
        });

        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-occupant-engine-thread"),
          threadId: ThreadId.make("thread-occupant-engine"),
          projectId: ProjectId.make("project-occupant-engine"),
          title: "Engine Thread",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          ownerSessionId: ownerA,
        });

        const dbPath = store.databasePath(ownerA);
        const eventIds = readOccupantEventIds(dbPath);
        assert.ok(eventIds.length >= 2);

        const database = new DatabaseSync(dbPath, { readOnly: true });
        try {
          const threads = database
            .prepare("SELECT thread_id AS threadId FROM projection_threads")
            .all()
            .map((row) => String((row as { readonly threadId: string }).threadId));
          assert.deepEqual(threads, ["thread-occupant-engine"]);
        } finally {
          database.close();
        }
      }),
    ),
  );
});
