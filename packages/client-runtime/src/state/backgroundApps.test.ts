import type { BackgroundAppSnapshot } from "@t3tools/contracts";
import { isBackgroundAppTerminalId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyBackgroundAppEvent,
  backgroundAppProgressHint,
  backgroundAppStatusLabel,
  EMPTY_BACKGROUND_APP_STATE,
  groupBackgroundApps,
  hydrateBackgroundApps,
  isBackgroundAppTransitionalStatus,
  matchBackgroundAppForServer,
} from "./backgroundApps.ts";

const managed = (overrides: Partial<BackgroundAppSnapshot> = {}): BackgroundAppSnapshot => ({
  id: "script:thread-1:dev",
  source: "managed",
  threadId: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  terminalId: "app-abc",
  label: "Dev",
  command: "pnpm dev",
  cwd: "/repo",
  worktreePath: null,
  status: "running",
  endpoints: [{ host: "127.0.0.1", port: 5173, url: "http://127.0.0.1:5173" }],
  previewUrl: "http://127.0.0.1:5173",
  startedAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
  capabilities: { canOpen: true, canReadLogs: true, canRestart: true, canStop: true },
  ...overrides,
});

describe("background app client state", () => {
  it("hydrates a list snapshot", () => {
    const app = managed();
    const state = hydrateBackgroundApps({
      apps: [app],
      serverEpoch: "epoch-1",
      revision: 3,
    });
    expect(state.revision).toBe(3);
    expect(state.serverEpoch).toBe("epoch-1");
    expect(state.apps.get(app.id)).toEqual(app);
  });

  it("applies later events and resets on epoch change", () => {
    const first = managed();
    const hydrated = hydrateBackgroundApps({
      apps: [first],
      serverEpoch: "epoch-1",
      revision: 1,
    });
    const ignored = applyBackgroundAppEvent(hydrated, {
      revision: 1,
      serverEpoch: "epoch-1",
      snapshot: managed({ status: "stopped" }),
    });
    expect(ignored.apps.get(first.id)?.status).toBe("running");

    const updated = applyBackgroundAppEvent(hydrated, {
      revision: 2,
      serverEpoch: "epoch-1",
      snapshot: managed({ status: "stopped" }),
    });
    expect(updated.apps.get(first.id)?.status).toBe("stopped");
    expect(updated.revision).toBe(2);

    const reconnected = applyBackgroundAppEvent(updated, {
      revision: 1,
      serverEpoch: "epoch-2",
      snapshot: managed({ id: "other", label: "Other" }),
    });
    expect(reconnected.apps.has(first.id)).toBe(false);
    expect(reconnected.apps.get("other")?.label).toBe("Other");
    expect(reconnected.serverEpoch).toBe("epoch-2");
  });

  it("labels transitional statuses without treating them as idle", () => {
    expect(backgroundAppStatusLabel("starting")).toBe("Starting…");
    expect(backgroundAppStatusLabel("stopping")).toBe("Stopping…");
    expect(isBackgroundAppTransitionalStatus("starting")).toBe(true);
    expect(isBackgroundAppTransitionalStatus("running")).toBe(false);
    expect(backgroundAppProgressHint({ status: "starting", endpoints: [] })).toBe(
      "Waiting for a listening port…",
    );
    expect(
      backgroundAppProgressHint({
        status: "starting",
        endpoints: [{ host: "127.0.0.1", port: 5173, url: "http://127.0.0.1:5173" }],
      }),
    ).toBeNull();
    expect(backgroundAppProgressHint({ status: "stopping", endpoints: [] })).toBe("Shutting down…");
  });

  it("groups running and stopped apps", () => {
    const grouped = groupBackgroundApps([
      managed({ id: "a", status: "running" }),
      managed({ id: "b", status: "stopped" }),
      managed({ id: "c", status: "failed" }),
      managed({ id: "d", status: "starting" }),
    ]);
    expect(grouped.active.map((app) => app.id)).toEqual(["a", "d"]);
    expect(grouped.idle.map((app) => app.id)).toEqual(["b", "c"]);
  });

  it("matches a discovered server to the owning app", () => {
    const app = managed();
    expect(
      matchBackgroundAppForServer([app], {
        port: 5173,
        terminal: { threadId: "thread-1", terminalId: "app-abc" },
      })?.id,
    ).toBe(app.id);
    expect(
      matchBackgroundAppForServer([app], {
        port: 5173,
        terminal: { threadId: "thread-1", terminalId: "term-1" },
      }),
    ).toBeNull();
    expect(matchBackgroundAppForServer([app], { port: 5173, terminal: null })).toBeNull();
  });

  it("starts from an empty client state", () => {
    expect(EMPTY_BACKGROUND_APP_STATE.apps.size).toBe(0);
    expect(EMPTY_BACKGROUND_APP_STATE.serverEpoch).toBeNull();
    expect(isBackgroundAppTerminalId("app-abc")).toBe(true);
    expect(isBackgroundAppTerminalId("term-1")).toBe(false);
  });
});
