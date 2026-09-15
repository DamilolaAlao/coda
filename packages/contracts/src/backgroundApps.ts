import * as Schema from "effect/Schema";

import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { TerminalEnvSchema } from "./terminal.ts";

export const BackgroundAppId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
export type BackgroundAppId = typeof BackgroundAppId.Type;

/** Dedicated PTY ids allocated by the background-app manager, hidden from the terminal UI. */
export const BACKGROUND_APP_TERMINAL_PREFIX = "app-";

export const isBackgroundAppTerminalId = (terminalId: string): boolean =>
  terminalId.startsWith(BACKGROUND_APP_TERMINAL_PREFIX);

export const BackgroundAppStatus = Schema.Literals([
  "starting",
  "running",
  "stopping",
  "stopped",
  "failed",
]);
export type BackgroundAppStatus = typeof BackgroundAppStatus.Type;

export const BackgroundAppCapabilities = Schema.Struct({
  canOpen: Schema.Boolean,
  canReadLogs: Schema.Boolean,
  canRestart: Schema.Boolean,
  canStop: Schema.Boolean,
});
export type BackgroundAppCapabilities = typeof BackgroundAppCapabilities.Type;

export const BackgroundAppEndpoint = Schema.Struct({
  host: TrimmedNonEmptyString,
  port: Schema.Int.check(Schema.isGreaterThan(0)).check(Schema.isLessThan(65_536)),
  url: TrimmedNonEmptyString,
});
export type BackgroundAppEndpoint = typeof BackgroundAppEndpoint.Type;

export const BackgroundAppSnapshot = Schema.Struct({
  id: BackgroundAppId,
  source: Schema.Literals(["managed", "discovered"]),
  threadId: ThreadId,
  projectId: Schema.NullOr(ProjectId),
  terminalId: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  command: Schema.NullOr(TrimmedNonEmptyString),
  cwd: TrimmedNonEmptyString,
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  status: BackgroundAppStatus,
  endpoints: Schema.Array(BackgroundAppEndpoint),
  previewUrl: Schema.NullOr(TrimmedNonEmptyString),
  startedAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  capabilities: BackgroundAppCapabilities,
});
export type BackgroundAppSnapshot = typeof BackgroundAppSnapshot.Type;

export const BackgroundAppListInput = Schema.Struct({
  threadId: Schema.optional(ThreadId),
});
export type BackgroundAppListInput = typeof BackgroundAppListInput.Type;

export const BackgroundAppListResult = Schema.Struct({
  apps: Schema.Array(BackgroundAppSnapshot),
  serverEpoch: TrimmedNonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type BackgroundAppListResult = typeof BackgroundAppListResult.Type;

export const BackgroundAppStartInput = Schema.Struct({
  id: Schema.optional(BackgroundAppId),
  threadId: ThreadId,
  projectId: Schema.optional(ProjectId),
  scriptId: Schema.optional(TrimmedNonEmptyString),
  label: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  env: Schema.optional(TerminalEnvSchema),
  previewUrl: Schema.optional(TrimmedNonEmptyString),
});
export type BackgroundAppStartInput = typeof BackgroundAppStartInput.Type;

export const BackgroundAppTargetInput = Schema.Struct({
  appId: BackgroundAppId,
});
export type BackgroundAppTargetInput = typeof BackgroundAppTargetInput.Type;

export const BackgroundAppLogInput = Schema.Struct({
  appId: BackgroundAppId,
});
export type BackgroundAppLogInput = typeof BackgroundAppLogInput.Type;

export const BackgroundAppLogEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    app: BackgroundAppSnapshot,
    data: Schema.String,
  }),
  Schema.TaggedStruct("output", {
    data: Schema.String,
  }),
  Schema.TaggedStruct("status", {
    status: BackgroundAppStatus,
  }),
]);
export type BackgroundAppLogEvent = typeof BackgroundAppLogEvent.Type;

export const BackgroundAppEvent = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  serverEpoch: TrimmedNonEmptyString,
  snapshot: BackgroundAppSnapshot,
});
export type BackgroundAppEvent = typeof BackgroundAppEvent.Type;

export class BackgroundAppError extends Schema.TaggedErrorClass<BackgroundAppError>()(
  "BackgroundAppError",
  {
    operation: Schema.String,
    appId: Schema.optional(Schema.String),
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Background app ${this.operation} failed: ${this.detail}`;
  }
}
