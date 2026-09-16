import {
  AuthSessionId,
  CommandId,
  EventId,
  isolationGitHubSubject,
  isolationOwnerId,
  type OrchestrationEvent,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  ClientSessionScope,
  isSessionDataIsolationEnabled,
  restrictProjectedRows,
  restrictProjectedRowsForClient,
  sessionCanSeeOwner,
  SessionVisibilityGate,
  stampOwnerOnCreateCommand,
  workspacePathIsWithinAny,
  workspacePathIsWithinRoot,
} from "./SessionDataIsolation.ts";
import { hideForeignBrowseEntries } from "./SessionWorkspaceAccess.ts";

const sessionA = AuthSessionId.make("session-a");
const sessionB = AuthSessionId.make("session-b");

function withIsolationFlag(value: string | undefined, run: () => void) {
  const previous = process.env.T3CODE_SESSION_DATA_ISOLATION;
  try {
    if (value === undefined) {
      delete process.env.T3CODE_SESSION_DATA_ISOLATION;
    } else {
      process.env.T3CODE_SESSION_DATA_ISOLATION = value;
    }
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.T3CODE_SESSION_DATA_ISOLATION;
    } else {
      process.env.T3CODE_SESSION_DATA_ISOLATION = previous;
    }
  }
}

it("treats isolation as on unless the env flag is an explicit opt-out", () => {
  assert.strictEqual(isSessionDataIsolationEnabled({}), true);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "" }), true);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "1" }), true);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "true" }), true);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "YES" }), true);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "0" }), false);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "no" }), false);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "off" }), false);
  assert.strictEqual(isSessionDataIsolationEnabled({ T3CODE_SESSION_DATA_ISOLATION: "false" }), false);
});

it("hides unowned and foreign rows from a client session", () => {
  withIsolationFlag(undefined, () => {
    assert.strictEqual(sessionCanSeeOwner(sessionA, null), false);
    assert.strictEqual(sessionCanSeeOwner(sessionA, undefined), false);
    assert.strictEqual(sessionCanSeeOwner(sessionA, sessionA), true);
    assert.strictEqual(sessionCanSeeOwner(sessionA, sessionB), false);
    assert.strictEqual(sessionCanSeeOwner(null, sessionB), true);
  });
});

it("shares every row when isolation is opted out", () => {
  withIsolationFlag("0", () => {
    assert.strictEqual(sessionCanSeeOwner(sessionA, null), true);
    assert.strictEqual(sessionCanSeeOwner(sessionA, sessionB), true);
  });
});

it("keeps a path inside its workspace root and rejects siblings", () => {
  assert.strictEqual(workspacePathIsWithinRoot("/tmp/mine", "/tmp/mine"), true);
  assert.strictEqual(workspacePathIsWithinRoot("/tmp/mine/src", "/tmp/mine"), true);
  assert.strictEqual(workspacePathIsWithinRoot("/tmp/mine-evil", "/tmp/mine"), false);
  assert.strictEqual(workspacePathIsWithinRoot("/tmp/mine", "/tmp/mine/src"), false);
  assert.strictEqual(
    workspacePathIsWithinAny("/tmp/mine/src/file.ts", ["/tmp/other", "/tmp/mine"]),
    true,
  );
  assert.strictEqual(workspacePathIsWithinAny("/tmp/theirs/src", ["/tmp/mine"]), false);
});

it("hides browse entries that sit in another session's workspace", () => {
  assert.deepStrictEqual(
    hideForeignBrowseEntries(
      [
        { name: "mine", fullPath: "/tmp/mine" },
        { name: "theirs", fullPath: "/tmp/theirs" },
        { name: "other", fullPath: "/tmp/other" },
      ],
      ["/tmp/theirs"],
    ).map((entry) => entry.name),
    ["mine", "other"],
  );
});

it("drops unowned rows and another session's projects and threads", () => {
  withIsolationFlag(undefined, () => {
    const restricted = restrictProjectedRows(
      [
        { projectId: "shared", ownerSessionId: null },
        { projectId: "mine", ownerSessionId: sessionA },
        { projectId: "theirs", ownerSessionId: sessionB },
      ],
      [
        { threadId: "shared-thread", projectId: "shared", ownerSessionId: null },
        { threadId: "my-thread", projectId: "mine", ownerSessionId: sessionA },
        { threadId: "their-thread", projectId: "theirs", ownerSessionId: sessionB },
        { threadId: "orphan-thread", projectId: "theirs", ownerSessionId: sessionA },
      ],
      sessionA,
    );
    assert.deepStrictEqual(
      restricted.projectRows.map((row) => row.projectId),
      ["mine"],
    );
    assert.deepStrictEqual(
      restricted.threadRows.map((row) => row.threadId),
      ["my-thread"],
    );
  });
});

it.effect("reads the current client session from fiber context", () =>
  Effect.gen(function* () {
    const previous = process.env.T3CODE_SESSION_DATA_ISOLATION;
    delete process.env.T3CODE_SESSION_DATA_ISOLATION;
    try {
      const restricted = yield* restrictProjectedRowsForClient(
        [{ projectId: "mine", ownerSessionId: sessionA }],
        [{ threadId: "my-thread", projectId: "mine", ownerSessionId: sessionA }],
      ).pipe(
        Effect.provideService(ClientSessionScope, { sessionId: sessionB, ownerId: sessionB }),
      );
      assert.deepStrictEqual(restricted.projectRows, []);
      assert.deepStrictEqual(restricted.threadRows, []);
    } finally {
      if (previous === undefined) {
        delete process.env.T3CODE_SESSION_DATA_ISOLATION;
      } else {
        process.env.T3CODE_SESSION_DATA_ISOLATION = previous;
      }
    }
  }),
);

it("overwrites client-supplied owners on create commands when isolation is on", () => {
  withIsolationFlag(undefined, () => {
    const stamped = stampOwnerOnCreateCommand(
      {
        type: "project.create",
        commandId: CommandId.make("cmd-1"),
        projectId: ProjectId.make("project-1"),
        title: "Project",
        workspaceRoot: "/tmp/project",
        createdAt: "2026-01-01T00:00:00.000Z",
        ownerSessionId: sessionB,
      },
      sessionA,
    );
    assert.strictEqual(stamped.ownerSessionId, sessionA);
  });
});

it("leaves create-command owners alone when isolation is opted out", () => {
  withIsolationFlag("0", () => {
    const stamped = stampOwnerOnCreateCommand(
      {
        type: "project.create",
        commandId: CommandId.make("cmd-1"),
        projectId: ProjectId.make("project-1"),
        title: "Project",
        workspaceRoot: "/tmp/project",
        createdAt: "2026-01-01T00:00:00.000Z",
        ownerSessionId: sessionB,
      },
      sessionA,
    );
    assert.strictEqual(stamped.ownerSessionId, sessionB);
  });
});

it("admits live events only for seeded aggregates and owned creates", () => {
  withIsolationFlag(undefined, () => {
    const gate = new SessionVisibilityGate(sessionA);
    gate.seed({ projectIds: ["project-mine"], threadIds: ["thread-mine"] });

    assert.strictEqual(
      gate.admit({
        sequence: 1,
        eventId: EventId.make("evt-1"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("thread-mine"),
        type: "thread.meta-updated",
        occurredAt: "2026-01-01T00:00:00.000Z",
        commandId: CommandId.make("cmd-1"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-1"),
        payload: { threadId: ThreadId.make("thread-mine"), updatedAt: "2026-01-01T00:00:00.000Z" },
      } as unknown as OrchestrationEvent),
      true,
    );
    assert.strictEqual(
      gate.admit({
        sequence: 2,
        eventId: EventId.make("evt-2"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("thread-theirs"),
        type: "thread.meta-updated",
        occurredAt: "2026-01-01T00:00:00.000Z",
        commandId: CommandId.make("cmd-2"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-2"),
        payload: { threadId: ThreadId.make("thread-theirs"), updatedAt: "2026-01-01T00:00:00.000Z" },
      } as unknown as OrchestrationEvent),
      false,
    );
    assert.strictEqual(
      gate.admit({
        sequence: 3,
        eventId: EventId.make("evt-3"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-unowned"),
        type: "project.created",
        occurredAt: "2026-01-01T00:00:00.000Z",
        commandId: CommandId.make("cmd-3"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-3"),
        payload: {
          projectId: ProjectId.make("project-unowned"),
          title: "Unowned",
          workspaceRoot: "/tmp/unowned",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          ownerSessionId: null,
        },
      } as unknown as OrchestrationEvent),
      false,
    );
    assert.strictEqual(
      gate.admit({
        sequence: 4,
        eventId: EventId.make("evt-4"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-new"),
        type: "project.created",
        occurredAt: "2026-01-01T00:00:00.000Z",
        commandId: CommandId.make("cmd-4"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-4"),
        payload: {
          projectId: ProjectId.make("project-new"),
          title: "New",
          workspaceRoot: "/tmp/new",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          ownerSessionId: sessionA,
        },
      } as unknown as OrchestrationEvent),
      true,
    );
    assert.strictEqual(
      gate.admit({
        sequence: 5,
        eventId: EventId.make("evt-5"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-new"),
        type: "project.meta-updated",
        occurredAt: "2026-01-01T00:00:01.000Z",
        commandId: CommandId.make("cmd-5"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-5"),
        payload: {
          projectId: ProjectId.make("project-new"),
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      } as unknown as OrchestrationEvent),
      true,
    );
  });
});

it("keys occupancy to the GitHub user id after OAuth", () => {
  const aliceOwner = isolationOwnerId({
    sessionId: sessionA,
    subject: isolationGitHubSubject(42, "Alice"),
  });
  assert.strictEqual(aliceOwner, AuthSessionId.make("github:42"));
  assert.strictEqual(
    isolationOwnerId({
      sessionId: sessionB,
      subject: isolationGitHubSubject(42, "alice-renamed"),
    }),
    aliceOwner,
  );
  assert.strictEqual(
    isolationOwnerId({ sessionId: sessionA, subject: "passcode-bootstrap" }),
    sessionA,
  );
});

it("lets two sessions of the same GitHub user see each other's rows", () => {
  withIsolationFlag(undefined, () => {
    const alice = AuthSessionId.make("github:42");
    const restricted = restrictProjectedRows(
      [
        { projectId: "alice-1", ownerSessionId: alice },
        { projectId: "bob-1", ownerSessionId: AuthSessionId.make("github:99") },
      ],
      [
        { threadId: "alice-thread", projectId: "alice-1", ownerSessionId: alice },
        {
          threadId: "bob-thread",
          projectId: "bob-1",
          ownerSessionId: AuthSessionId.make("github:99"),
        },
      ],
      alice,
    );
    assert.deepStrictEqual(
      restricted.projectRows.map((row) => row.projectId),
      ["alice-1"],
    );
    assert.deepStrictEqual(
      restricted.threadRows.map((row) => row.threadId),
      ["alice-thread"],
    );
  });
});
