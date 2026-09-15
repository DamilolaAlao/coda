import { AuthSessionId, RpcClientId } from "@t3tools/contracts";
import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as GitHubCredentialStore from "./GitHubCredentialStore.ts";
import { GitHubTenant } from "./GitHubTenant.ts";

const SESSION_A = AuthSessionId.make("session-a");
const SESSION_B = AuthSessionId.make("session-b");
const textEncoder = new TextEncoder();

const makeMemorySecrets = () => {
  const values = new Map<string, Uint8Array>();
  return {
    values,
    layer: Layer.mock(ServerSecretStore.ServerSecretStore)({
      get: (name) => Effect.succeed(Option.fromUndefinedOr(values.get(name))),
      set: (name, bytes) =>
        Effect.sync(() => {
          values.set(name, Uint8Array.from(bytes));
        }),
      create: (name, bytes) =>
        Effect.sync(() => {
          values.set(name, Uint8Array.from(bytes));
        }),
      getOrCreateRandom: () => Effect.die("unused"),
      remove: (name) =>
        Effect.sync(() => {
          values.delete(name);
        }),
    }),
  };
};

const memory = makeMemorySecrets();
const storeLayer = GitHubCredentialStore.layer.pipe(
  Layer.provideMerge(memory.layer),
  Layer.provideMerge(NodeServices.layer),
);

const credential = (
  sessionId: AuthSessionId,
  token: string,
): GitHubCredentialStore.GitHubCredentialRecord => ({
  version: 1,
  sessionId,
  token,
  tokenType: "bearer",
  scope: "repo",
  account: sessionId === SESSION_A ? "octocat" : "hubot",
  host: "github.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("GitHubCredentialStore", () => {
  it.effect("isolates tokens by session", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      yield* store.set(credential(SESSION_A, "token-a"));
      yield* store.set(credential(SESSION_B, "token-b"));
      const a = yield* store.get(SESSION_A);
      const b = yield* store.get(SESSION_B);
      assert.strictEqual(Option.getOrThrow(a).token, "token-a");
      assert.strictEqual(Option.getOrThrow(b).token, "token-b");
      yield* store.remove(SESSION_A);
      assert.strictEqual(Option.isNone(yield* store.get(SESSION_A)), true);
      assert.strictEqual(Option.getOrThrow(yield* store.get(SESSION_B)).token, "token-b");
    }).pipe(Effect.provide(storeLayer)),
  );

  it.effect("consumes OAuth state once and rejects replay", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      const first = yield* store.createOAuthState({
        sessionId: SESSION_A,
        redirectUri: "https://coda.example/api/auth/github/callback",
      });
      const second = yield* store.createOAuthState({
        sessionId: SESSION_B,
        redirectUri: "https://coda.example/api/auth/github/callback",
      });
      expect(first.state).not.toBe(second.state);
      const consumedA = yield* store.consumeOAuthState(first.state);
      assert.strictEqual(Option.getOrThrow(consumedA).sessionId, SESSION_A);
      assert.strictEqual(Option.isNone(yield* store.consumeOAuthState(first.state)), true);
      const consumedB = yield* store.consumeOAuthState(second.state);
      assert.strictEqual(Option.getOrThrow(consumedB).sessionId, SESSION_B);
    }).pipe(Effect.provide(storeLayer)),
  );

  it.effect("drops expired OAuth state", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      const { state } = yield* store.createOAuthState({
        sessionId: SESSION_A,
        redirectUri: "https://coda.example/api/auth/github/callback",
      });
      // @effect-diagnostics-next-line preferSchemaOverJson:off
      const expired = JSON.stringify({
        version: 1,
        state,
        sessionId: SESSION_A,
        redirectUri: "https://coda.example/api/auth/github/callback",
        createdAt: "1969-01-01T00:00:00.000Z",
        expiresAt: "1970-01-01T00:00:00.000Z",
      });
      memory.values.set(
        GitHubCredentialStore.oauthStateSecretName(state),
        textEncoder.encode(expired),
      );
      assert.strictEqual(Option.isNone(yield* store.consumeOAuthState(state)), true);
    }).pipe(Effect.provide(storeLayer)),
  );

  it.effect("resolves the current tenant credential before host fallback", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      yield* store.set(credential(SESSION_A, "token-a"));
      yield* store.set(credential(SESSION_B, "token-b"));
      const resolved = yield* GitHubCredentialStore.resolveGitHubProcessCredential(store, "/repo");
      assert.strictEqual(Option.getOrThrow(resolved).token, "token-a");
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: SESSION_A }),
      Effect.provide(storeLayer),
    ),
  );

  it.effect("does not borrow another tenant token without a matching lease", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      yield* store.set(credential(SESSION_A, "token-a"));
      const resolved = yield* GitHubCredentialStore.resolveGitHubProcessCredential(store, "/repo");
      assert.strictEqual(Option.isNone(resolved), true);
    }).pipe(Effect.provide(storeLayer)),
  );

  it.effect("uses a matching background lease when no request tenant is set", () => {
    const epoch = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");
    const policy = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
      reportClientActivity: () => Effect.void,
      removeRpcClient: () => Effect.void,
      reportHostPowerState: () => Effect.void,
      snapshot: Effect.succeed({
        hostPower: {
          source: "unknown",
          idle: "unknown",
          idleSeconds: null,
          locked: "unknown",
          suspended: false,
          onBattery: "unknown",
          lowPowerMode: "unknown",
          thermalState: "unknown",
          stale: true,
          updatedAt: epoch,
        },
        leases: [
          {
            sessionId: SESSION_B,
            rpcClientId: RpcClientId.make(1),
            clientId: "mobile-b",
            clientKind: "mobile",
            visible: true,
            focused: true,
            recentlyInteracted: true,
            scopes: [{ type: "vcs-status", cwd: "/repo" }],
            updatedAt: epoch,
            expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
          },
        ],
        activeForegroundLeaseCount: 1,
        activeScopeKeys: ["vcs-status:/repo"],
        shouldRunOpportunisticWork: true,
        updatedAt: epoch,
      }),
      streamChanges: Stream.empty,
      hasDemand: () => Effect.succeed(true),
      shouldRunScopeWork: () => Effect.succeed(true),
      shouldRunOpportunisticWork: Effect.succeed(true),
    });
    return Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      yield* store.set(credential(SESSION_A, "token-a"));
      yield* store.set(credential(SESSION_B, "token-b"));
      const resolved = yield* GitHubCredentialStore.resolveGitHubProcessCredential(store, "/repo");
      assert.strictEqual(Option.getOrThrow(resolved).token, "token-b");
      const unmatched = yield* GitHubCredentialStore.resolveGitHubProcessCredential(
        store,
        "/other",
      );
      assert.strictEqual(Option.isNone(unmatched), true);
    }).pipe(Effect.provide(Layer.mergeAll(storeLayer, policy)));
  });

  it.effect("survives reconstructing the store over the same secrets", () =>
    Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      yield* store.set(credential(SESSION_A, "persisted-token"));
      const rebuilt = yield* GitHubCredentialStore.make;
      const loaded = yield* rebuilt.get(SESSION_A);
      assert.strictEqual(Option.getOrThrow(loaded).token, "persisted-token");
    }).pipe(Effect.provide(storeLayer)),
  );
});
