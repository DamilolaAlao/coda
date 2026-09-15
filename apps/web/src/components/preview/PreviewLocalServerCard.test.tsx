import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PreviewLocalServerCard } from "./PreviewLocalServerCard";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

const threadRef = {
  environmentId: EnvironmentId.make("env-1"),
  threadId: ThreadId.make("thread-1"),
};

const server: PreviewableServer = {
  host: "127.0.0.1",
  port: 5173,
  url: "http://127.0.0.1:5173",
  processName: "vite",
  pid: 100,
  terminal: { threadId: ThreadId.make("thread-1"), terminalId: "app-abc" },
  source: "scanner",
  requestedUrl: "http://127.0.0.1:5173",
};

describe("PreviewLocalServerCard", () => {
  it("exposes restart and stop only when the matched app allows them", () => {
    const html = renderToStaticMarkup(
      <PreviewLocalServerCard
        threadRef={threadRef}
        server={server}
        app={{
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
          startedAt: null,
          updatedAt: "2026-09-15T12:00:00.000Z",
          capabilities: { canOpen: true, canReadLogs: true, canRestart: true, canStop: true },
        }}
        onOpen={() => undefined}
        onRestart={() => undefined}
        onStop={() => undefined}
      />,
    );
    expect(html).toContain("Restart Dev");
    expect(html).toContain("Stop Dev");
    expect(html).toContain("Managed app");
  });

  it("hides lifecycle actions for an unmatched listener", () => {
    const html = renderToStaticMarkup(
      <PreviewLocalServerCard threadRef={threadRef} server={server} onOpen={() => undefined} />,
    );
    expect(html).not.toContain("Restart");
    expect(html).not.toContain("Stop");
  });
});
