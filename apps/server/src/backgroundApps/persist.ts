import { BackgroundAppStartInput, BackgroundAppStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "../atomicWrite.ts";

export const MAX_PERSISTED_BACKGROUND_APPS = 200;

export interface PersistedBackgroundApp {
  readonly id: string;
  readonly terminalId: string;
  readonly launch: BackgroundAppStartInput;
  readonly lastStartedAt: string | null;
  readonly lastKnownStatus: BackgroundAppStatus;
  readonly updatedAt: string;
}

const Store = Schema.Struct({
  version: Schema.Literal(1),
  apps: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      terminalId: Schema.String,
      launch: BackgroundAppStartInput,
      lastStartedAt: Schema.NullOr(Schema.String),
      lastKnownStatus: Schema.optional(BackgroundAppStatus),
      updatedAt: Schema.String,
    }),
  ),
});

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(Store));

const reconcileStatus = (
  lastKnownStatus: BackgroundAppStatus | undefined,
): BackgroundAppStatus => {
  if (lastKnownStatus === "failed") return "failed";
  return "stopped";
};

export const loadBackgroundApps = (
  persistPath: string,
): Effect.Effect<ReadonlyArray<PersistedBackgroundApp>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(persistPath).pipe(Effect.option);
    if (Option.isNone(raw)) return [];
    const parsed = yield* decode(raw.value).pipe(Effect.option);
    if (Option.isNone(parsed)) {
      yield* Effect.logWarning("ignoring unreadable background app store", { persistPath });
      return [];
    }
    return parsed.value.apps.map((app) => ({
      id: app.id,
      terminalId: app.terminalId,
      launch: app.launch,
      lastStartedAt: app.lastStartedAt,
      lastKnownStatus: reconcileStatus(app.lastKnownStatus),
      updatedAt: app.updatedAt,
    }));
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.as(Effect.logWarning("failed to load background apps", { persistPath, cause }), []),
    ),
  );

export const persistBackgroundApps = (input: {
  readonly persistPath: string;
  readonly apps: ReadonlyArray<PersistedBackgroundApp>;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  writeFileStringAtomically({
    filePath: input.persistPath,
    contents: `${JSON.stringify({
      version: 1,
      apps: input.apps.slice(-MAX_PERSISTED_BACKGROUND_APPS),
    })}\n`,
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("failed to persist background apps", {
        persistPath: input.persistPath,
        cause,
      }),
    ),
  );
