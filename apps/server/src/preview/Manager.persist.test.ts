import { it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { expect } from "vite-plus/test";

import * as PreviewManager from "./Manager.ts";

it.layer(NodeServices.layer)("PreviewManager persistence", (it) => {
  it.effect("restores open tabs after a process restart", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-preview-persist-" });
      const persistPath = path.join(root, "preview-sessions.json");
      const threadId = ThreadId.make("thread-persist");

      const first = yield* PreviewManager.makePersisted(persistPath);
      const opened = yield* first.open({ threadId, url: "https://example.com/preview" });
      yield* first.navigate({
        threadId,
        tabId: opened.tabId,
        url: "https://example.com/preview",
      });

      const second = yield* PreviewManager.makePersisted(persistPath);
      const listed = yield* second.list({ threadId });
      expect(listed.sessions).toHaveLength(1);
      expect(listed.sessions[0]?.tabId).toBe(opened.tabId);
      expect(listed.sessions[0]?.navStatus).toMatchObject({
        _tag: "Success",
        url: "https://example.com/preview",
      });
    }),
  );
});
