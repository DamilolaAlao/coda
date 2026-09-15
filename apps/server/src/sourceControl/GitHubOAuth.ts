import {
  AuthSessionId,
  GitHubOAuthError,
  type SourceControlDisconnectGitHubResult,
  type SourceControlStartGitHubOAuthResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import * as GitHubCredentialStore from "./GitHubCredentialStore.ts";
import { GitHubTenant } from "./GitHubTenant.ts";

export const GITHUB_OAUTH_CALLBACK_PATH = "/api/auth/github/callback";
export const GITHUB_OAUTH_MESSAGE_TYPE = "t3.github-oauth";
const GITHUB_OAUTH_SCOPES = "repo read:org workflow gist";

const GitHubOAuthTokenResponse = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  scope: Schema.String,
});

const GitHubUserResponse = Schema.Struct({
  login: Schema.String,
});

export function oauthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function configuredCallbackUrl(): string | null {
  const configured = process.env.GITHUB_REDIRECT_URI?.trim();
  if (configured) return configured;
  const publicUrl = process.env.T3CODE_PUBLIC_URL?.trim();
  return publicUrl ? new URL(GITHUB_OAUTH_CALLBACK_PATH, publicUrl).toString() : null;
}

function requestCallbackUrl(request: HttpServerRequest.HttpServerRequest): string | null {
  const configured = configuredCallbackUrl();
  if (configured) return configured;
  const url = Option.getOrNull(HttpServerRequest.toURL(request));
  return url ? new URL(GITHUB_OAUTH_CALLBACK_PATH, url.origin).toString() : null;
}

function oauthError(operation: string, detail: string, cause?: unknown) {
  return new GitHubOAuthError({
    operation,
    detail,
    ...(cause === undefined ? {} : { cause }),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderGitHubOAuthCompletionHtml(input: {
  readonly result: "connected" | "failed";
  readonly detail: string;
}): string {
  const connected = input.result === "connected";
  const title = connected ? "GitHub connected" : "GitHub connection failed";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      main { max-width: 28rem; text-align: center; }
      p { line-height: 1.45; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(input.detail)}</p>
      <p>You can close this window and return to Coda.</p>
    </main>
    <script>
      window.opener && window.opener.postMessage({
        type: ${JSON.stringify(GITHUB_OAUTH_MESSAGE_TYPE)},
        result: ${JSON.stringify(input.result)}
      }, "*");
      if (window.opener) {
        window.close();
      } else {
        window.location.replace("/");
      }
    </script>
  </body>
</html>`;
}

function completionResponse(result: "connected" | "failed", detail: string) {
  return HttpServerResponse.text(renderGitHubOAuthCompletionHtml({ result, detail }), {
    status: result === "connected" ? 200 : 400,
    contentType: "text/html; charset=utf-8",
  });
}

const githubApiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "coda",
} as const;

export class GitHubOAuth extends Context.Service<
  GitHubOAuth,
  {
    readonly start: Effect.Effect<SourceControlStartGitHubOAuthResult, GitHubOAuthError>;
    readonly disconnect: Effect.Effect<SourceControlDisconnectGitHubResult, GitHubOAuthError>;
    readonly revokeSessionCredential: (sessionId: AuthSessionId) => Effect.Effect<void>;
  }
>()("t3/sourceControl/GitHubOAuth") {}

const revokeGitHubAppToken = (token: string) =>
  Effect.gen(function* () {
    const oauth = oauthConfig();
    if (!oauth) return;
    const maybeClient = yield* Effect.serviceOption(HttpClient.HttpClient);
    if (Option.isNone(maybeClient)) return;
    const httpClient = maybeClient.value.pipe(HttpClient.filterStatusOk);
    yield* HttpClientRequest.delete(
      `https://api.github.com/applications/${encodeURIComponent(oauth.clientId)}/token`,
    ).pipe(
      HttpClientRequest.setHeaders(githubApiHeaders),
      HttpClientRequest.basicAuth(oauth.clientId, oauth.clientSecret),
      HttpClientRequest.bodyJsonUnsafe({ access_token: token }),
      httpClient.execute,
      Effect.asVoid,
      Effect.ignore,
    );
  });

export const make = Effect.gen(function* () {
  const store = yield* GitHubCredentialStore.GitHubCredentialStore;

  const start: GitHubOAuth["Service"]["start"] = Effect.gen(function* () {
    const tenant = yield* GitHubTenant;
    if (tenant === null) {
      return yield* oauthError("start", "An authenticated Coda session is required.");
    }
    const oauth = oauthConfig();
    const redirectUri = configuredCallbackUrl();
    if (!oauth || !redirectUri) {
      return yield* oauthError(
        "start",
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI on the Coda server.",
      );
    }
    const { state } = yield* store.createOAuthState({
      sessionId: tenant.sessionId,
      redirectUri,
    });
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", oauth.clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", GITHUB_OAUTH_SCOPES);
    authorizeUrl.searchParams.set("state", state);
    return { authorizeUrl: authorizeUrl.toString() };
  });

  const revokeSessionCredential: GitHubOAuth["Service"]["revokeSessionCredential"] = (sessionId) =>
    store.get(sessionId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (credential) =>
            revokeGitHubAppToken(credential.token).pipe(
              Effect.ensuring(store.remove(sessionId)),
              Effect.asVoid,
            ),
        }),
      ),
      Effect.ignore,
    );

  const disconnect: GitHubOAuth["Service"]["disconnect"] = Effect.gen(function* () {
    const tenant = yield* GitHubTenant;
    if (tenant === null) {
      return { disconnected: false };
    }
    const credential = yield* store.get(tenant.sessionId);
    if (Option.isNone(credential)) {
      return { disconnected: false };
    }
    yield* revokeGitHubAppToken(credential.value.token);
    yield* store.remove(tenant.sessionId);
    return { disconnected: true };
  });

  return GitHubOAuth.of({
    start,
    disconnect,
    revokeSessionCredential,
  });
});

export const layer = Layer.effect(GitHubOAuth, make);

const callbackRoute = HttpRouter.add(
  "GET",
  GITHUB_OAUTH_CALLBACK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = Option.getOrNull(HttpServerRequest.toURL(request));
    const oauth = oauthConfig();
    const store = yield* GitHubCredentialStore.GitHubCredentialStore;
    const fallbackRedirectUri = requestCallbackUrl(request);

    if (!url || !oauth) {
      return completionResponse(
        "failed",
        "GitHub OAuth is not configured on this Coda server.",
      );
    }

    const receivedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!receivedState || !code) {
      return completionResponse("failed", "The GitHub callback was missing its one-time state.");
    }

    const consumed = yield* store.consumeOAuthState(receivedState);
    if (Option.isNone(consumed)) {
      return completionResponse("failed", "This GitHub sign-in link expired or was already used.");
    }

    const redirectUri = consumed.value.redirectUri || fallbackRedirectUri;
    if (!redirectUri) {
      return completionResponse("failed", "GitHub OAuth is not configured on this Coda server.");
    }

    const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const token = yield* HttpClientRequest.post("https://github.com/login/oauth/access_token").pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeaders(githubApiHeaders),
      HttpClientRequest.bodyJsonUnsafe({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      httpClient.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(GitHubOAuthTokenResponse)),
    );

    const user = yield* HttpClientRequest.get("https://api.github.com/user").pipe(
      HttpClientRequest.setHeaders(githubApiHeaders),
      HttpClientRequest.bearerToken(token.access_token),
      httpClient.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(GitHubUserResponse)),
    );

    const now = DateTime.formatIso(yield* DateTime.now);
    yield* store.set({
      version: 1,
      sessionId: consumed.value.sessionId,
      token: token.access_token,
      tokenType: token.token_type,
      scope: token.scope,
      account: user.login,
      host: GitHubCredentialStore.GITHUB_HOST,
      createdAt: now,
      updatedAt: now,
    });

    return completionResponse(
      "connected",
      "This Coda client can now use your GitHub account. Return to the app.",
    );
  }).pipe(
    Effect.catchCause(() =>
      Effect.gen(function* () {
        yield* Effect.logError("GitHub OAuth callback failed");
        return completionResponse(
          "failed",
          "GitHub could not complete sign-in. Return to Coda and try again.",
        );
      }),
    ),
  ),
);

export const routeLayer = callbackRoute;

export const internals = {
  oauthConfig,
  configuredCallbackUrl,
  renderGitHubOAuthCompletionHtml,
};
