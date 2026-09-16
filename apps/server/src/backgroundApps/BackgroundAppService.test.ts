import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import {
  type DiscoveredLocalServer,
  ThreadId,
  type TerminalAttachStreamEvent,
  type TerminalEvent,
  type TerminalMetadataStreamEvent,
  type TerminalSessionSnapshot,
  type TerminalSummary,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { expect } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import { PortDiscovery } from "../preview/PortScanner.ts";
import { TerminalManager } from "../terminal/Manager.ts";
import * as BackgroundApps from "./BackgroundAppService.ts";

class FakeTerminal {
  readonly opens: string[] = [];
  readonly writes: string[] = [];
  readonly closes: string[] = [];
  readonly restarts: string[] = [];
  readonly killedPids: number[] = [];
  readonly eventListeners = new Set<(event: TerminalEvent) => Effect.Effect<void>>();
  readonly metadataListeners = new Set<
    (event: TerminalMetadataStreamEvent) => Effect.Effect<void>
  >();
  private history = "";

  readonly layer = Layer.succeed(
    TerminalManager,
    TerminalManager.of({
      open: (input) =>
        Effect.sync(() => {
          this.opens.push(input.terminalId);
          return snapshot(input.threadId, input.terminalId);
        }),
      restart: (input) =>
        Effect.sync(() => {
          this.restarts.push(input.terminalId);
          this.history = "";
          return snapshot(input.threadId, input.terminalId);
        }),
      write: (input) =>
        Effect.sync(() => {
          this.writes.push(input.data);
          this.history += input.data;
        }),
      close: (input) => {
        this.closes.push(input.terminalId ?? "*");
        return this.emitEvent({
          type: "closed",
          threadId: input.threadId,
          terminalId: input.terminalId ?? "unknown",
        });
      },
      attachStream: (input, listener) => {
        const event: TerminalAttachStreamEvent = {
          type: "snapshot",
          snapshot: {
            ...snapshot(input.threadId, input.terminalId),
            history: this.history,
          },
        };
        return listener(event).pipe(Effect.as(() => undefined));
      },
      resize: () => Effect.void,
      clear: () => Effect.void,
      subscribe: (listener) =>
        Effect.sync(() => {
          this.eventListeners.add(listener);
          return () => this.eventListeners.delete(listener);
        }),
      subscribeMetadata: (listener) =>
        Effect.sync(() => {
          this.metadataListeners.add(listener);
          return () => this.metadataListeners.delete(listener);
        }),
    }),
  );

  emitEvent(event: TerminalEvent) {
    return Effect.forEach([...this.eventListeners], (listener) => listener(event), {
      discard: true,
    });
  }

  emitMetadata(terminal: TerminalSummary) {
    const event: TerminalMetadataStreamEvent = { type: "upsert", terminal };
    return Effect.forEach([...this.metadataListeners], (listener) => listener(event), {
      discard: true,
    });
  }
}

class FakePorts {
  readonly servers: DiscoveredLocalServer[] = [];

  readonly layer = Layer.succeed(
    PortDiscovery,
    PortDiscovery.of({
      scan: () => Effect.succeed(this.servers),
      subscribe: (_input, _listener) => Effect.void,
      retain: Effect.void,
      registerTerminalProcesses: () => Effect.void,
      unregisterTerminal: () => Effect.void,
    }),
  );
}

const snapshot = (threadId: string, terminalId: string): TerminalSessionSnapshot => ({
  threadId,
  terminalId,
  cwd: "/repo",
  worktreePath: null,
  status: "running",
  pid: 4242,
  history: "",
  exitCode: null,
  exitSignal: null,
  label: "app",
  updatedAt: "2026-09-15T12:00:00.000Z",
});

const summary = (threadId: string, terminalId: string): TerminalSummary => ({
  threadId,
  terminalId,
  cwd: "/repo",
  worktreePath: null,
  status: "running",
  pid: 4242,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: true,
  label: "vite",
  updatedAt: "2026-09-15T12:00:00.000Z",
});

const startInput = {
  threadId: ThreadId.make("thread-1"),
  label: "Dev",
  command: "pnpm dev",
  cwd: "/repo",
  scriptId: "dev",
};

const withApps = <A, E, R>(
  terminals: FakeTerminal,
  ports: FakePorts,
  effect: Effect.Effect<A, E, R | BackgroundApps.BackgroundAppService>,
) =>
  effect.pipe(
    Effect.provide(
      BackgroundApps.layer.pipe(
        Layer.provide(terminals.layer),
        Layer.provide(ports.layer),
        Layer.provide(ServerConfig.layerTest("/tmp", { prefix: "t3-background-apps-svc-" })),
      ),
    ),
    Effect.scoped,
  );

it.layer(NodeServices.layer)("BackgroundAppService", (it) => {
  it.effect("starts once and replays the stored command on restart", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        const first = yield* apps.start(startInput);
        const second = yield* apps.start({ ...startInput, id: first.id });
        expect(second.id).toBe(first.id);
        expect(terminals.opens).toHaveLength(1);
        expect(terminals.writes).toEqual(["pnpm dev\r"]);

        yield* apps.stop({ appId: first.id });
        expect(terminals.closes).toContain(first.terminalId);

        const restarted = yield* apps.restart({ appId: first.id });
        expect(restarted.status).toBe("running");
        expect(terminals.writes.filter((write) => write === "pnpm dev\r")).toHaveLength(2);
        expect(terminals.killedPids).toEqual([]);
      }),
    );
  });

  it.effect("starts distinct apps concurrently without sharing a terminal", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        const [first, second] = yield* Effect.all(
          [
            apps.start({ ...startInput, scriptId: "web", command: "pnpm dev:web" }),
            apps.start({ ...startInput, scriptId: "api", command: "pnpm dev:api" }),
          ],
          { concurrency: "unbounded" },
        );
        expect(first.id).not.toBe(second.id);
        expect(first.terminalId).not.toBe(second.terminalId);
        expect(terminals.opens).toHaveLength(2);
        expect(new Set(terminals.writes)).toEqual(new Set(["pnpm dev:web\r", "pnpm dev:api\r"]));
      }),
    );
  });

  it.effect("treats stop as idempotent", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        const started = yield* apps.start({
          ...startInput,
          scriptId: "lint",
          command: "pnpm lint --watch",
        });
        const firstStop = yield* apps.stop({ appId: started.id });
        const secondStop = yield* apps.stop({ appId: started.id });
        expect(firstStop.status).toBe("stopped");
        expect(secondStop.status).toBe("stopped");
      }),
    );
  });

  it.effect("lists HTTP APIs even when they are not owned by a Coda terminal", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        ports.servers.push({
          host: "localhost",
          port: 3658,
          url: "http://localhost:3658",
          processName: "node",
          pid: 777,
          terminal: null,
        });
        const listed = yield* apps.list({ threadId: ThreadId.make("thread-1") });
        const discovered = listed.apps.find((app) => app.source === "discovered");
        expect(discovered?.label).toBe("node");
        expect(discovered?.endpoints[0]?.port).toBe(3658);
        expect(discovered?.capabilities.canOpen).toBe(true);
        expect(discovered?.capabilities.canStop).toBe(false);
        expect(discovered?.capabilities.canReadLogs).toBe(false);
      }),
    );
  });

  it.effect("associates discovered listeners with terminal ownership and never signals a PID", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        yield* terminals.emitMetadata(summary("thread-1", "term-1"));
        ports.servers.push({
          host: "127.0.0.1",
          port: 3000,
          url: "http://127.0.0.1:3000",
          processName: "node",
          pid: 99999,
          terminal: { threadId: ThreadId.make("thread-1"), terminalId: "term-1" },
        });
        const listed = yield* apps.list({ threadId: ThreadId.make("thread-1") });
        const discovered = listed.apps.find((app) => app.source === "discovered");
        expect(discovered?.capabilities.canRestart).toBe(false);
        expect(discovered?.capabilities.canStop).toBe(true);
        expect(discovered?.command).toBeNull();

        yield* apps.stop({ appId: discovered!.id });
        expect(terminals.closes).toContain("term-1");
        expect(terminals.killedPids).toEqual([]);
      }),
    );
  });

  it.effect("reconciles a terminal exit onto the managed app", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        const started = yield* apps.start({
          ...startInput,
          scriptId: "watch",
          command: "pnpm test --watch",
        });
        yield* terminals.emitEvent({
          type: "exited",
          threadId: started.threadId,
          terminalId: started.terminalId,
          exitCode: 0,
          exitSignal: null,
        });
        const listed = yield* apps.list({ threadId: started.threadId });
        expect(listed.apps.find((app) => app.id === started.id)?.status).toBe("stopped");
      }),
    );
  });

  it.effect("attaches bounded terminal history for logs", () => {
    const terminals = new FakeTerminal();
    const ports = new FakePorts();
    return withApps(
      terminals,
      ports,
      Effect.gen(function* () {
        const apps = yield* BackgroundApps.BackgroundAppService;
        const started = yield* apps.start({
          ...startInput,
          scriptId: "logs",
          command: "pnpm dev:web",
        });
        const events = yield* Ref.make<string[]>([]);
        const unsubscribe = yield* apps.attachLogs({ appId: started.id }, (event) =>
          Ref.update(events, (current) =>
            event._tag === "snapshot" || event._tag === "output"
              ? [...current, event.data]
              : current,
          ),
        );
        unsubscribe();
        expect((yield* Ref.get(events)).join("")).toContain("pnpm dev:web");
      }),
    );
  });
});
