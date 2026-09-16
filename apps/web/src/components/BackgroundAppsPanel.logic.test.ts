import { DISCOVERED_LISTENER_TERMINAL_ID, ProjectId, ThreadId, type BackgroundAppEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  backgroundAppLogPlaceholder,
  backgroundAppsHeaderSummary,
  shouldRefreshBackgroundAppsFromEvent,
} from "./BackgroundAppsPanel.logic";

const event = (snapshot: BackgroundAppEvent["snapshot"]): BackgroundAppEvent => ({
  revision: 1,
  serverEpoch: "epoch-1",
  snapshot,
});

const snapshot = (
  overrides: Partial<BackgroundAppEvent["snapshot"]> = {},
): BackgroundAppEvent["snapshot"] => ({
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
  endpoints: [],
  previewUrl: null,
  startedAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
  capabilities: { canOpen: true, canReadLogs: true, canRestart: true, canStop: true },
  ...overrides,
});

describe("shouldRefreshBackgroundAppsFromEvent", () => {
  it("ignores subscription states that have no event yet", () => {
    expect(shouldRefreshBackgroundAppsFromEvent({ _tag: "Initial" }, "thread-1")).toBe(false);
    expect(shouldRefreshBackgroundAppsFromEvent({ _tag: "Waiting" }, "thread-1")).toBe(false);
    expect(shouldRefreshBackgroundAppsFromEvent({ _tag: "Failure" }, "thread-1")).toBe(false);
  });

  it("refreshes when a successful event belongs to the open thread", () => {
    expect(
      shouldRefreshBackgroundAppsFromEvent(
        { _tag: "Success", value: event(snapshot()) },
        "thread-1",
      ),
    ).toBe(true);
  });

  it("refreshes discovered listeners even when they belong to another thread", () => {
    expect(
      shouldRefreshBackgroundAppsFromEvent(
        {
          _tag: "Success",
          value: event(
            snapshot({
              threadId: ThreadId.make("thread-other"),
              terminalId: DISCOVERED_LISTENER_TERMINAL_ID,
              source: "discovered",
            }),
          ),
        },
        "thread-1",
      ),
    ).toBe(true);
  });

  it("ignores successful events for other managed apps", () => {
    expect(
      shouldRefreshBackgroundAppsFromEvent(
        { _tag: "Success", value: event(snapshot({ threadId: ThreadId.make("thread-other") })) },
        "thread-1",
      ),
    ).toBe(false);
  });
});

describe("backgroundAppsHeaderSummary", () => {
  it("does not claim zero apps while the first list is in flight", () => {
    expect(backgroundAppsHeaderSummary({ pending: true, appCount: 0 })).toBe("Loading…");
    expect(backgroundAppsHeaderSummary({ pending: true, appCount: 2 })).toBe("2 apps in this thread");
    expect(backgroundAppsHeaderSummary({ pending: false, appCount: 1 })).toBe("1 app in this thread");
  });
});

describe("backgroundAppLogPlaceholder", () => {
  it("distinguishes connecting from waiting for output", () => {
    expect(backgroundAppLogPlaceholder({ connected: false, hasOutput: false })).toBe(
      "Connecting to logs…",
    );
    expect(backgroundAppLogPlaceholder({ connected: true, hasOutput: false })).toBe(
      "Waiting for output…",
    );
    expect(backgroundAppLogPlaceholder({ connected: false, hasOutput: true })).toBe("");
  });
});
