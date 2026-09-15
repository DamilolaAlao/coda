import { PreviewSessionSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "../atomicWrite.ts";

const MAX_PERSISTED_SESSIONS = 200;

const PersistedPreviewSessions = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  sessions: Schema.Array(
    Schema.Struct({
      threadId: Schema.String,
      tabId: Schema.String,
      snapshot: PreviewSessionSnapshot,
    }),
  ),
});

export interface PersistablePreviewSession {
  readonly threadId: string;
  readonly tabId: string;
  readonly snapshot: PreviewSessionSnapshot;
}

export interface PersistablePreviewState {
  readonly sessions: ReadonlyMap<string, PersistablePreviewSession>;
  readonly revision: number;
}

const decodePersisted = Schema.decodeUnknownEffect(Schema.fromJsonString(PersistedPreviewSessions));

export const compositePreviewSessionKey = (threadId: string, tabId: string): string =>
  `${threadId}\u0000${tabId}`;

function durableSnapshot(snapshot: PreviewSessionSnapshot): PreviewSessionSnapshot {
  if (snapshot.navStatus._tag !== "Loading") {
    return snapshot;
  }
  return {
    ...snapshot,
    navStatus: {
      _tag: "Success",
      url: snapshot.navStatus.url,
      title: snapshot.navStatus.title,
    },
  };
}

export const loadPersistedPreviewSessions = (
  persistPath: string,
): Effect.Effect<PersistablePreviewState, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(persistPath).pipe(Effect.option);
    if (Option.isNone(raw)) {
      return { sessions: new Map(), revision: 0 };
    }
    const decoded = yield* decodePersisted(raw.value).pipe(Effect.option);
    if (Option.isNone(decoded)) {
      yield* Effect.logWarning("ignoring unreadable preview session store", { persistPath });
      return { sessions: new Map(), revision: 0 };
    }
    const sessions = new Map<string, PersistablePreviewSession>();
    for (const session of decoded.value.sessions) {
      sessions.set(compositePreviewSessionKey(session.threadId, session.tabId), {
        threadId: session.threadId,
        tabId: session.tabId,
        snapshot: durableSnapshot(session.snapshot),
      });
    }
    return { sessions, revision: decoded.value.revision };
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.as(
        Effect.logWarning("failed to load preview sessions", { persistPath, cause }),
        { sessions: new Map<string, PersistablePreviewSession>(), revision: 0 },
      ),
    ),
  );

export const persistPreviewSessions = (input: {
  readonly persistPath: string;
  readonly state: PersistablePreviewState;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  writeFileStringAtomically({
    filePath: input.persistPath,
    contents: `${JSON.stringify({
      version: 1,
      revision: input.state.revision,
      sessions: [...input.state.sessions.values()]
        .toSorted((left, right) => right.snapshot.updatedAt.localeCompare(left.snapshot.updatedAt))
        .slice(0, MAX_PERSISTED_SESSIONS)
        .map((session) => ({
          threadId: session.threadId,
          tabId: session.tabId,
          snapshot: durableSnapshot(session.snapshot),
        })),
    })}\n`,
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("failed to persist preview sessions", {
        persistPath: input.persistPath,
        cause,
      }),
    ),
  );
