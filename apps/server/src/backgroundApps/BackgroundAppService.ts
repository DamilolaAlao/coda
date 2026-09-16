import * as NodeCrypto from "node:crypto";
import {
  BackgroundAppError,
  type BackgroundAppEvent,
  type BackgroundAppId,
  type BackgroundAppListInput,
  type BackgroundAppListResult,
  type BackgroundAppLogEvent,
  type BackgroundAppLogInput,
  type BackgroundAppSnapshot,
  type BackgroundAppStartInput,
  type BackgroundAppTargetInput,
  DISCOVERED_LISTENER_TERMINAL_ID,
  ThreadId,
  type TerminalAttachStreamEvent,
  type TerminalEvent,
  type TerminalMetadataStreamEvent,
  type TerminalSummary,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import * as ServerConfig from "../config.ts";
import { PortDiscovery } from "../preview/PortScanner.ts";
import { TerminalManager } from "../terminal/Manager.ts";
import {
  loadBackgroundApps,
  persistBackgroundApps,
  type PersistedBackgroundApp,
} from "./persist.ts";

interface RuntimeApp extends PersistedBackgroundApp {
  readonly status: BackgroundAppSnapshot["status"];
}

const reconcilePersistedStatus = (
  lastKnownStatus: PersistedBackgroundApp["lastKnownStatus"],
): RuntimeApp["status"] => (lastKnownStatus === "failed" ? "failed" : "stopped");

type AppListener = (event: BackgroundAppEvent) => Effect.Effect<void>;

const terminalIdForApp = (id: string) =>
  `app-${NodeCrypto.createHash("sha256").update(id).digest("hex").slice(0, 20)}`;

const error = (operation: string, detail: string, appId?: string, cause?: unknown) =>
  new BackgroundAppError({ operation, detail, ...(appId ? { appId } : {}), ...(cause ? { cause } : {}) });

const mapTerminalLogEvent = (
  event: TerminalAttachStreamEvent,
  app: BackgroundAppSnapshot,
): BackgroundAppLogEvent | null => {
  switch (event.type) {
    case "snapshot":
      return { _tag: "snapshot", app, data: event.snapshot.history };
    case "output":
      return { _tag: "output", data: event.data };
    case "exited":
    case "closed":
      return { _tag: "status", status: "stopped" };
    case "error":
      return { _tag: "status", status: "failed" };
    default:
      return null;
  }
};

export class BackgroundAppService extends Context.Service<
  BackgroundAppService,
  {
    readonly list: (
      input: BackgroundAppListInput,
    ) => Effect.Effect<BackgroundAppListResult, BackgroundAppError>;
    readonly start: (
      input: BackgroundAppStartInput,
    ) => Effect.Effect<BackgroundAppSnapshot, BackgroundAppError>;
    readonly stop: (
      input: BackgroundAppTargetInput,
    ) => Effect.Effect<BackgroundAppSnapshot, BackgroundAppError>;
    readonly restart: (
      input: BackgroundAppTargetInput,
    ) => Effect.Effect<BackgroundAppSnapshot, BackgroundAppError>;
    readonly subscribe: (
      input: BackgroundAppListInput,
      listener: AppListener,
    ) => Effect.Effect<() => void>;
    readonly attachLogs: (
      input: BackgroundAppLogInput,
      listener: (event: BackgroundAppLogEvent) => Effect.Effect<void>,
    ) => Effect.Effect<() => void, BackgroundAppError>;
  }
>()("t3/backgroundApps/BackgroundAppService") {}

const make = Effect.gen(function* () {
    const terminalManager = yield* TerminalManager;
    const portDiscovery = yield* PortDiscovery;
    const config = yield* ServerConfig.ServerConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const persisted = yield* loadBackgroundApps(config.backgroundAppsPath);
    const appsRef = yield* Ref.make(
      new Map<string, RuntimeApp>(
        persisted.map((app) => [
          app.id,
          { ...app, status: reconcilePersistedStatus(app.lastKnownStatus) } satisfies RuntimeApp,
        ]),
      ),
    );
    const terminalsRef = yield* Ref.make(new Map<string, TerminalSummary>());
    const revisionRef = yield* Ref.make(Math.max(1, persisted.length));
    const listeners = new Map<AppListener, BackgroundAppListInput>();
    const serverEpoch = NodeCrypto.randomUUID();

    const persist = Effect.gen(function* () {
      const apps = yield* Ref.get(appsRef);
      yield* persistBackgroundApps({
        persistPath: config.backgroundAppsPath,
        apps: [...apps.values()].map((app) => ({
          id: app.id,
          terminalId: app.terminalId,
          launch: app.launch,
          lastStartedAt: app.lastStartedAt,
          lastKnownStatus: app.status,
          updatedAt: app.updatedAt,
        })),
      });
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    const managedSnapshot = (
      app: RuntimeApp,
      endpoints: BackgroundAppSnapshot["endpoints"] = [],
    ): BackgroundAppSnapshot => ({
      id: app.id as BackgroundAppId,
      source: "managed",
      threadId: app.launch.threadId,
      projectId: app.launch.projectId ?? null,
      terminalId: app.terminalId,
      label: app.launch.label,
      command: app.launch.command,
      cwd: app.launch.cwd,
      worktreePath: app.launch.worktreePath ?? null,
      status: app.status,
      endpoints,
      previewUrl: app.launch.previewUrl ?? endpoints[0]?.url ?? null,
      startedAt: app.lastStartedAt,
      updatedAt: app.updatedAt,
      capabilities: {
        canOpen: app.launch.previewUrl !== undefined || endpoints.length > 0,
        canReadLogs: true,
        canRestart: true,
        canStop: app.status === "starting" || app.status === "running" || app.status === "stopping",
      },
    });

    const publish = Effect.fn(function* (snapshot: BackgroundAppSnapshot) {
      const revision = yield* Ref.updateAndGet(revisionRef, (value) => value + 1);
      const event = { revision, serverEpoch, snapshot } satisfies BackgroundAppEvent;
      yield* Effect.forEach([...listeners.entries()], ([listener, input]) =>
        input.threadId === undefined || input.threadId === snapshot.threadId
          ? listener(event).pipe(Effect.catchCause(Effect.logWarning))
          : Effect.void,
      );
    });

    const list = Effect.fn(function* (input: BackgroundAppListInput) {
      const [apps, servers, terminals, revision, now] = yield* Effect.all([
        Ref.get(appsRef),
        portDiscovery.scan([], { includeHttpApis: true }),
        Ref.get(terminalsRef),
        Ref.get(revisionRef),
        DateTime.now,
      ]);
      const managedTerminalKeys = new Set(
        [...apps.values()].map((app) => `${app.launch.threadId}\u0000${app.terminalId}`),
      );
      const managed = [...apps.values()].map((app) => {
        const endpoints = servers
          .filter(
            (server) =>
              server.terminal?.threadId === app.launch.threadId &&
              server.terminal.terminalId === app.terminalId,
          )
          .map(({ host, port, url }) => ({ host, port, url }));
        return managedSnapshot(app, endpoints);
      });
      const discovered = servers.flatMap((server): ReadonlyArray<BackgroundAppSnapshot> => {
        if (server.port === config.port) return [];
        if (server.terminal) {
          const key = `${server.terminal.threadId}\u0000${server.terminal.terminalId}`;
          if (managedTerminalKeys.has(key)) return [];
          const terminal = terminals.get(key);
          if (!terminal) return [];
          return [
            {
              id: `discovered:${server.terminal.threadId}:${server.terminal.terminalId}:${server.port}` as BackgroundAppId,
              source: "discovered",
              threadId: server.terminal.threadId,
              projectId: null,
              terminalId: server.terminal.terminalId,
              label: server.processName ?? terminal.label ?? `Server on ${server.port}`,
              command: null,
              cwd: terminal.cwd,
              worktreePath: terminal.worktreePath,
              status: "running",
              endpoints: [{ host: server.host, port: server.port, url: server.url }],
              previewUrl: server.url,
              startedAt: null,
              updatedAt: terminal.updatedAt,
              capabilities: {
                canOpen: true,
                canReadLogs: true,
                canRestart: false,
                canStop: true,
              },
            },
          ];
        }
        const threadId = input.threadId ?? ThreadId.make(DISCOVERED_LISTENER_TERMINAL_ID);
        return [
          {
            id: `discovered:listener:${server.host}:${server.port}` as BackgroundAppId,
            source: "discovered",
            threadId,
            projectId: null,
            terminalId: DISCOVERED_LISTENER_TERMINAL_ID,
            label: server.processName ?? `Server on ${server.port}`,
            command: null,
            cwd: config.cwd,
            worktreePath: null,
            status: "running",
            endpoints: [{ host: server.host, port: server.port, url: server.url }],
            previewUrl: server.url,
            startedAt: null,
            updatedAt: DateTime.formatIso(now),
            capabilities: {
              canOpen: true,
              canReadLogs: false,
              canRestart: false,
              canStop: false,
            },
          },
        ];
      });
      return {
        apps: [...managed, ...discovered].filter(
          (app) => input.threadId === undefined || app.threadId === input.threadId,
        ),
        serverEpoch,
        revision,
      } satisfies BackgroundAppListResult;
    });

    const upsertStatus = Effect.fn(function* (
      app: RuntimeApp,
      status: RuntimeApp["status"],
      startedAt = app.lastStartedAt,
    ) {
      const next: RuntimeApp = {
        ...app,
        status,
        lastKnownStatus: status,
        lastStartedAt: startedAt,
        updatedAt: DateTime.formatIso(yield* DateTime.now),
      };
      yield* Ref.update(appsRef, (apps) => new Map(apps).set(app.id, next));
      yield* persist;
      yield* publish(managedSnapshot(next));
      return next;
    });

    const launch = Effect.fn(function* (app: RuntimeApp, restart: boolean) {
      yield* upsertStatus(app, "starting");
      const terminalInput = {
        threadId: app.launch.threadId,
        terminalId: app.terminalId,
        cwd: app.launch.cwd,
        worktreePath: app.launch.worktreePath ?? null,
        cols: 100,
        rows: 30,
        ...(app.launch.env ? { env: app.launch.env } : {}),
      };
      if (restart) {
        yield* terminalManager.restart(terminalInput);
      } else {
        yield* terminalManager.open(terminalInput);
      }
      yield* terminalManager.write({
        threadId: app.launch.threadId,
        terminalId: app.terminalId,
        data: `${app.launch.command}\r`,
      });
      const startedAt = DateTime.formatIso(yield* DateTime.now);
      return yield* upsertStatus(app, "running", startedAt);
    });

    const start = (input: BackgroundAppStartInput) =>
      Effect.gen(function* () {
        const id = input.id ?? `${input.threadId}:${input.scriptId ?? NodeCrypto.randomUUID()}`;
        const apps = yield* Ref.get(appsRef);
        const existing = apps.get(id);
        if (existing?.status === "running" || existing?.status === "starting") {
          return managedSnapshot(existing);
        }
        const now = DateTime.formatIso(yield* DateTime.now);
        const app: RuntimeApp = existing
          ? { ...existing, launch: input }
          : {
              id,
              terminalId: terminalIdForApp(id),
              launch: input,
              lastStartedAt: null,
              lastKnownStatus: "stopped",
              updatedAt: now,
              status: "stopped",
            };
        yield* Ref.update(appsRef, (all) => new Map(all).set(id, app));
        const launched = yield* launch(app, false);
        return managedSnapshot(launched);
      }).pipe(
        Effect.mapError((cause) =>
          error("start", "Could not launch the terminal process.", input.id, cause),
        ),
      );

    const findManaged = Effect.fn(function* (appId: string) {
      const app = (yield* Ref.get(appsRef)).get(appId);
      if (!app) return yield* error("lookup", "Unknown managed app.", appId);
      return app;
    });

    const stop = (input: BackgroundAppTargetInput) =>
      Effect.gen(function* () {
        const apps = yield* Ref.get(appsRef);
        const managed = apps.get(input.appId);
        if (managed) {
          if (managed.status === "stopped" || managed.status === "failed") {
            return managedSnapshot(managed);
          }
          const stopping = yield* upsertStatus(managed, "stopping");
          yield* terminalManager.close({
            threadId: stopping.launch.threadId,
            terminalId: stopping.terminalId,
          });
          return managedSnapshot(yield* upsertStatus(stopping, "stopped"));
        }
        const discovered = (yield* list({})).apps.find(
          (app) => app.id === input.appId && app.source === "discovered",
        );
        if (!discovered?.capabilities.canStop) {
          return yield* error(
            "stop",
            "The process is not owned by a Coda terminal.",
            input.appId,
          );
        }
        yield* terminalManager.close({
          threadId: discovered.threadId,
          terminalId: discovered.terminalId,
        });
        return {
          ...discovered,
          status: "stopped",
          capabilities: { ...discovered.capabilities, canStop: false },
        } satisfies BackgroundAppSnapshot;
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "BackgroundAppError"
            ? cause
            : error("stop", "Could not stop the terminal process.", input.appId, cause),
        ),
      );

    const restart = (input: BackgroundAppTargetInput) =>
      Effect.gen(function* () {
        const app = yield* findManaged(input.appId);
        const launched = yield* launch(app, app.status !== "stopped");
        return managedSnapshot(launched);
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "BackgroundAppError"
            ? cause
            : error("restart", "Could not restart the terminal process.", input.appId, cause),
        ),
      );

    const reconcileTerminalEvent = (event: TerminalEvent) =>
      Effect.gen(function* () {
        if (event.type !== "exited" && event.type !== "closed" && event.type !== "error") return;
        const apps = yield* Ref.get(appsRef);
        const app = [...apps.values()].find(
          (candidate) =>
            candidate.launch.threadId === event.threadId &&
            candidate.terminalId === event.terminalId,
        );
        if (!app) return;
        yield* upsertStatus(app, event.type === "error" ? "failed" : "stopped");
      });

    const updateTerminalMetadata = (event: TerminalMetadataStreamEvent) =>
      Ref.update(terminalsRef, (current) => {
        const next = new Map(current);
        if (event.type === "snapshot") {
          next.clear();
          for (const terminal of event.terminals) {
            next.set(`${terminal.threadId}\u0000${terminal.terminalId}`, terminal);
          }
        } else if (event.type === "upsert") {
          next.set(`${event.terminal.threadId}\u0000${event.terminal.terminalId}`, event.terminal);
        } else {
          next.delete(`${event.threadId}\u0000${event.terminalId}`);
        }
        return next;
      });

    const unsubscribeEvents = yield* terminalManager.subscribe(reconcileTerminalEvent);
    const unsubscribeMetadata = yield* terminalManager.subscribeMetadata(updateTerminalMetadata);
    yield* portDiscovery.retain;
    yield* portDiscovery.subscribe(
      { configuredUrls: [], initialSnapshot: [], includeHttpApis: true },
      () =>
      Effect.gen(function* () {
        const listed = yield* list({});
        yield* Effect.forEach(listed.apps, (snapshot) => publish(snapshot), { discard: true });
      }).pipe(Effect.catchCause(Effect.logWarning)),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        unsubscribeEvents();
        unsubscribeMetadata();
      }),
    );

    return BackgroundAppService.of({
      list,
      start,
      stop,
      restart,
      subscribe: (input, listener) =>
        Effect.sync(() => {
          listeners.set(listener, input);
          return () => listeners.delete(listener);
        }),
      attachLogs: (input, listener) =>
        Effect.gen(function* () {
          const app = (yield* list({})).apps.find((candidate) => candidate.id === input.appId);
          if (!app?.capabilities.canReadLogs) {
            return yield* error("logs", "Logs are unavailable for this app.", input.appId);
          }
          return yield* terminalManager
            .attachStream(
              {
                threadId: app.threadId,
                terminalId: app.terminalId,
                cwd: app.cwd,
                worktreePath: app.worktreePath,
              },
              (event) => {
                const mapped = mapTerminalLogEvent(event, app);
                return mapped ? listener(mapped) : Effect.void;
              },
            )
            .pipe(
              Effect.mapError((cause) =>
                error("logs", "Could not attach to the terminal history.", input.appId, cause),
              ),
            );
        }),
    });
  });

export const layer = Layer.effect(BackgroundAppService, make);
