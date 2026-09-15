import {
  BackgroundAppError,
  BackgroundAppListResult,
  BackgroundAppSnapshot,
  BackgroundAppTargetInput,
  TerminalEnvSchema,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { BackgroundAppService } from "../../../backgroundApps/BackgroundAppService.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext, BackgroundAppService];

export const BackgroundAppsListTool = Tool.make("background_apps_list", {
  description:
    "List long-running workspace apps for this thread, including status, ports, preview URLs, and available lifecycle controls.",
  parameters: Schema.Struct({}),
  success: BackgroundAppListResult,
  failure: BackgroundAppError,
  dependencies,
})
  .annotate(Tool.Title, "List background apps")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BackgroundAppsStartTool = Tool.make("background_apps_start", {
  description:
    "Start a long-running development server as a managed background app. Use this instead of a foreground shell for dev servers and watchers.",
  parameters: Schema.Struct({
    id: Schema.optional(TrimmedNonEmptyString),
    label: TrimmedNonEmptyString,
    command: TrimmedNonEmptyString,
    cwd: TrimmedNonEmptyString,
    worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
    env: Schema.optional(TerminalEnvSchema),
    previewUrl: Schema.optional(TrimmedNonEmptyString),
  }),
  success: BackgroundAppSnapshot,
  failure: BackgroundAppError,
  dependencies,
})
  .annotate(Tool.Title, "Start background app")
  .annotate(Tool.Destructive, true);

export const BackgroundAppsStopTool = Tool.make("background_apps_stop", {
  description:
    "Stop a managed background app or a listener proven to be owned by a Coda terminal.",
  parameters: BackgroundAppTargetInput,
  success: BackgroundAppSnapshot,
  failure: BackgroundAppError,
  dependencies,
})
  .annotate(Tool.Title, "Stop background app")
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true);

export const BackgroundAppsRestartTool = Tool.make("background_apps_restart", {
  description: "Restart a managed background app using its exact stored launch specification.",
  parameters: BackgroundAppTargetInput,
  success: BackgroundAppSnapshot,
  failure: BackgroundAppError,
  dependencies,
})
  .annotate(Tool.Title, "Restart background app")
  .annotate(Tool.Destructive, true);

export const BackgroundAppsToolkit = Toolkit.make(
  BackgroundAppsListTool,
  BackgroundAppsStartTool,
  BackgroundAppsStopTool,
  BackgroundAppsRestartTool,
);
