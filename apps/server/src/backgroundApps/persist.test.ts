import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { ThreadId, type BackgroundAppStartInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { expect } from "vite-plus/test";

import { loadBackgroundApps, persistBackgroundApps } from "./persist.ts";

const launch = (): BackgroundAppStartInput => ({
  threadId: ThreadId.make("thread-1"),
  label: "Dev",
  command: "pnpm dev",
  cwd: "/repo",
});

it.layer(NodeServices.layer)("background app persistence", (it) => {
  it.effect("round-trips launch specs without storing a PID", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-background-apps-" });
      const persistPath = path.join(root, "background-apps.json");

      yield* persistBackgroundApps({
        persistPath,
        apps: [
          {
            id: "script:thread-1:dev",
            terminalId: "app-abc",
            launch: launch(),
            lastStartedAt: "2026-09-15T12:00:00.000Z",
            lastKnownStatus: "running",
            updatedAt: "2026-09-15T12:00:01.000Z",
          },
        ],
      });

      const raw = yield* fs.readFileString(persistPath);
      expect(raw).not.toContain("pid");
      expect(raw).toContain("pnpm dev");

      const loaded = yield* loadBackgroundApps(persistPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.launch.command).toBe("pnpm dev");
      expect(loaded[0]?.lastKnownStatus).toBe("stopped");
    }),
  );

  it.effect("keeps failed apps failed after a restart", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-background-apps-failed-" });
      const persistPath = path.join(root, "background-apps.json");

      yield* persistBackgroundApps({
        persistPath,
        apps: [
          {
            id: "script:thread-1:dev",
            terminalId: "app-abc",
            launch: launch(),
            lastStartedAt: null,
            lastKnownStatus: "failed",
            updatedAt: "2026-09-15T12:00:01.000Z",
          },
        ],
      });

      const loaded = yield* loadBackgroundApps(persistPath);
      expect(loaded[0]?.lastKnownStatus).toBe("failed");
    }),
  );
});
