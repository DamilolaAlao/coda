import * as Effect from "effect/Effect";

import { BackgroundAppService } from "../../../backgroundApps/BackgroundAppService.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";
import { BackgroundAppsToolkit } from "./tools.ts";

export const BackgroundAppsToolkitHandlersLive = BackgroundAppsToolkit.toLayer({
  background_apps_list: () =>
    Effect.gen(function* () {
      const invocation = yield* McpInvocationContext;
      const apps = yield* BackgroundAppService;
      return yield* apps.list({ threadId: invocation.threadId });
    }),
  background_apps_start: (input) =>
    Effect.gen(function* () {
      const invocation = yield* McpInvocationContext;
      const apps = yield* BackgroundAppService;
      return yield* apps.start({ ...input, threadId: invocation.threadId });
    }),
  background_apps_stop: (input) =>
    Effect.flatMap(BackgroundAppService, (apps) => apps.stop(input)),
  background_apps_restart: (input) =>
    Effect.flatMap(BackgroundAppService, (apps) => apps.restart(input)),
});
