import { AuthSessionId } from "@t3tools/contracts";
import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as GitHubCredentialStore from "./GitHubCredentialStore.ts";
import * as GitHubOAuth from "./GitHubOAuth.ts";
import { GitHubTenant } from "./GitHubTenant.ts";

describe("GitHub OAuth completion page", () => {
  it("notifies the opener without putting tokens in the page", () => {
    const html = GitHubOAuth.renderGitHubOAuthCompletionHtml({
      result: "connected",
      detail: "This Coda client can now use your GitHub account.",
    });
    expect(html).toContain(GitHubOAuth.GITHUB_OAUTH_MESSAGE_TYPE);
    expect(html).toContain('"connected"');
    expect(html).toContain("You can close this window");
    expect(html).not.toContain("gho_");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("/settings/source-control");
  });

  it("renders a failed callback without leaking configuration secrets", () => {
    const html = GitHubOAuth.renderGitHubOAuthCompletionHtml({
      result: "failed",
      detail: "This GitHub sign-in link expired or was already used.",
    });
    expect(html).toContain('"failed"');
    expect(html).not.toContain("GITHUB_CLIENT_SECRET");
    expect(html).not.toContain("client_secret");
  });
});

describe("GitHubOAuth.start", () => {
  it.effect("returns an authorize URL for the current tenant", () => {
    const previous = {
      id: process.env.GITHUB_CLIENT_ID,
      secret: process.env.GITHUB_CLIENT_SECRET,
      redirect: process.env.GITHUB_REDIRECT_URI,
    };
    process.env.GITHUB_CLIENT_ID = "test-client";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
    process.env.GITHUB_REDIRECT_URI = "https://coda.example/api/auth/github/callback";
    const sessionId = AuthSessionId.make("oauth-tenant");
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: () => Effect.succeed(Option.none()),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: ({ sessionId: requested }) =>
        Effect.succeed({ state: `state-for-${requested}` }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });
    return Effect.gen(function* () {
      const oauth = yield* GitHubOAuth.GitHubOAuth;
      const result = yield* oauth.start;
      expect(result.authorizeUrl).toContain("https://github.com/login/oauth/authorize");
      expect(result.authorizeUrl).toContain("client_id=test-client");
      expect(result.authorizeUrl).toContain("state=state-for-oauth-tenant");
      expect(result.authorizeUrl).not.toContain("test-secret");
      expect(result.authorizeUrl).not.toContain("gho_");
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId }),
      Effect.provide(GitHubOAuth.layer.pipe(Layer.provide(store), Layer.provide(NodeServices.layer))),
      Effect.ensuring(
        Effect.sync(() => {
          process.env.GITHUB_CLIENT_ID = previous.id;
          process.env.GITHUB_CLIENT_SECRET = previous.secret;
          process.env.GITHUB_REDIRECT_URI = previous.redirect;
        }),
      ),
    );
  });
});

describe("GitHubOAuth.disconnect", () => {
  it.effect("removes only the current tenant credential", () => {
    const values = new Map<string, Uint8Array>();
    const storeLayer = GitHubCredentialStore.layer.pipe(
      Layer.provideMerge(
        Layer.mock(ServerSecretStore.ServerSecretStore)({
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
      ),
      Layer.provideMerge(NodeServices.layer),
    );
    const sessionA = AuthSessionId.make("oauth-a");
    const sessionB = AuthSessionId.make("oauth-b");
    const record = (
      sessionId: AuthSessionId,
      token: string,
    ): GitHubCredentialStore.GitHubCredentialRecord => ({
      version: 1,
      sessionId,
      token,
      tokenType: "bearer",
      scope: "repo",
      account: "octocat",
      host: "github.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    return Effect.gen(function* () {
      const store = yield* GitHubCredentialStore.GitHubCredentialStore;
      const oauth = yield* GitHubOAuth.GitHubOAuth;
      yield* store.set(record(sessionA, "gho_a"));
      yield* store.set(record(sessionB, "gho_b"));
      const disconnected = yield* oauth.disconnect;
      assert.strictEqual(disconnected.disconnected, true);
      assert.strictEqual(Option.isNone(yield* store.get(sessionA)), true);
      assert.strictEqual(Option.getOrThrow(yield* store.get(sessionB)).token, "gho_b");
      yield* oauth.revokeSessionCredential(sessionB);
      assert.strictEqual(Option.isNone(yield* store.get(sessionB)), true);
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: sessionA }),
      Effect.provide(GitHubOAuth.layer.pipe(Layer.provideMerge(storeLayer))),
    );
  });
});
