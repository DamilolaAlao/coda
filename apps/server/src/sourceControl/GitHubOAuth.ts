import * as NodeCrypto from "node:crypto";
import { AuthTerminalOperateScope } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import * as ServerConfig from "../config.ts";
import { isHttpsHttpRequest } from "../auth/utils.ts";
import { authenticateRawRouteWithScope } from "../http.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { findAuthenticatedGitHubAccount, parseGitHubAuthStatus } from "./gitHubAuthStatus.ts";

const GITHUB_HOST = "github.com";
const GITHUB_OAUTH_START_PATH = "/api/auth/github";
const GITHUB_OAUTH_CALLBACK_PATH = "/api/auth/github/callback";
const GITHUB_OAUTH_LOGOUT_PATH = "/api/auth/github/logout";
const SOURCE_CONTROL_SETTINGS_PATH = "/settings/source-control";
const GITHUB_OAUTH_SCOPES = "repo read:org workflow gist";

const GitHubOAuthTokenResponse = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  scope: Schema.String,
});

function oauthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function requestUrl(request: HttpServerRequest.HttpServerRequest): URL | null {
  return Option.getOrNull(HttpServerRequest.toURL(request));
}

function callbackUrl(request: HttpServerRequest.HttpServerRequest): string | null {
  const configured = process.env.GITHUB_REDIRECT_URI?.trim();
  if (configured) return configured;
  const url = requestUrl(request);
  return url ? new URL(GITHUB_OAUTH_CALLBACK_PATH, url.origin).toString() : null;
}

function stateCookieName(config: ServerConfig.ServerConfig["Service"]): string {
  return `t3_github_oauth_state_${config.port}`;
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    }
  }
  return null;
}

function stateMatches(expected: string | null, received: string | null): boolean {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    NodeCrypto.timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function stateCookie(name: string, value: string, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=${GITHUB_OAUTH_CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`;
}

function clearStateCookie(name: string, secure: boolean): string {
  return `${name}=; Path=${GITHUB_OAUTH_CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function settingsRedirect(request: HttpServerRequest.HttpServerRequest, result: string) {
  const requestOrigin = requestUrl(request)?.origin;
  const configuredOrigin = process.env.T3CODE_PUBLIC_URL?.trim();
  const origin = configuredOrigin || requestOrigin;
  if (!origin) {
    return HttpServerResponse.text("GitHub authentication finished. Return to Coda.", {
      status: result === "connected" ? 200 : 400,
    });
  }
  const redirect = new URL(SOURCE_CONTROL_SETTINGS_PATH, origin);
  redirect.searchParams.set("github", result);
  return HttpServerResponse.redirect(redirect.toString(), { status: 302 });
}

const startRoute = HttpRouter.add(
  "GET",
  GITHUB_OAUTH_START_PATH,
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthTerminalOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig.ServerConfig;
    const oauth = oauthConfig();
    const redirectUri = callbackUrl(request);
    if (!oauth || !redirectUri) {
      return HttpServerResponse.text(
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI on the Coda server.",
        { status: 503 },
      );
    }

    const crypto = yield* Crypto.Crypto;
    const state = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", oauth.clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", GITHUB_OAUTH_SCOPES);
    authorizeUrl.searchParams.set("state", state);

    const response = HttpServerResponse.redirect(authorizeUrl.toString(), { status: 302 });
    return HttpServerResponse.setHeader(
      response,
      "set-cookie",
      stateCookie(stateCookieName(config), state, isHttpsHttpRequest(request)),
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError("Failed to start GitHub OAuth", { cause }).pipe(
        Effect.as(
          HttpServerResponse.text("Could not start GitHub authentication.", { status: 500 }),
        ),
      ),
    ),
  ),
);

const callbackRoute = HttpRouter.add(
  "GET",
  GITHUB_OAUTH_CALLBACK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig.ServerConfig;
    const url = requestUrl(request);
    const oauth = oauthConfig();
    const redirectUri = callbackUrl(request);
    const cookieName = stateCookieName(config);
    const secure = isHttpsHttpRequest(request);

    if (!url || !oauth || !redirectUri) {
      return settingsRedirect(request, "configuration_error");
    }

    const expectedState = cookieValue(request.headers.cookie, cookieName);
    const receivedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!stateMatches(expectedState, receivedState) || !code) {
      const response = settingsRedirect(request, "invalid_callback");
      return HttpServerResponse.setHeader(
        response,
        "set-cookie",
        clearStateCookie(cookieName, secure),
      );
    }

    const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const token = yield* HttpClientRequest.post("https://github.com/login/oauth/access_token").pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJsonUnsafe({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      httpClient.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(GitHubOAuthTokenResponse)),
    );

    const process = yield* VcsProcess.VcsProcess;
    yield* process.run({
      operation: "github.oauth.login",
      command: "gh",
      args: ["auth", "login", "--hostname", GITHUB_HOST, "--git-protocol", "https", "--with-token"],
      cwd: config.cwd,
      stdin: token.access_token,
      timeoutMs: 30_000,
      maxOutputBytes: 16_000,
    });
    yield* process.run({
      operation: "github.oauth.setup-git",
      command: "gh",
      args: ["auth", "setup-git", "--hostname", GITHUB_HOST],
      cwd: config.cwd,
      timeoutMs: 10_000,
      maxOutputBytes: 16_000,
    });

    const response = settingsRedirect(request, "connected");
    return HttpServerResponse.setHeader(
      response,
      "set-cookie",
      clearStateCookie(cookieName, secure),
    );
  }).pipe(
    Effect.catchCause(() =>
      Effect.gen(function* () {
        // The failed HTTP request may contain the OAuth client secret in its body.
        yield* Effect.logError("GitHub OAuth callback failed");
        const request = yield* HttpServerRequest.HttpServerRequest;
        const config = yield* ServerConfig.ServerConfig;
        return HttpServerResponse.setHeader(
          settingsRedirect(request, "failed"),
          "set-cookie",
          clearStateCookie(stateCookieName(config), isHttpsHttpRequest(request)),
        );
      }),
    ),
  ),
);

const logoutRoute = HttpRouter.add(
  "POST",
  GITHUB_OAUTH_LOGOUT_PATH,
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthTerminalOperateScope);
    const config = yield* ServerConfig.ServerConfig;
    const process = yield* VcsProcess.VcsProcess;
    const status = yield* process.run({
      operation: "github.oauth.auth-status",
      command: "gh",
      args: ["auth", "status", "--hostname", GITHUB_HOST, "--json", "hosts"],
      cwd: config.cwd,
      allowNonZeroExit: true,
      timeoutMs: 10_000,
      maxOutputBytes: 16_000,
    });

    const account = findAuthenticatedGitHubAccount(parseGitHubAuthStatus(status.stdout).accounts);
    if (!account) {
      return HttpServerResponse.empty({ status: 204 });
    }
    yield* process.run({
      operation: "github.oauth.logout",
      command: "gh",
      args: ["auth", "logout", "--hostname", GITHUB_HOST, "--user", account.account],
      cwd: config.cwd,
      timeoutMs: 10_000,
      maxOutputBytes: 16_000,
    });
    return HttpServerResponse.empty({ status: 204 });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError("Failed to disconnect GitHub", { cause }).pipe(
        Effect.as(HttpServerResponse.text("Could not disconnect GitHub.", { status: 500 })),
      ),
    ),
  ),
);

export const routeLayer = Layer.mergeAll(startRoute, callbackRoute, logoutRoute);

export const internals = {
  cookieValue,
  stateMatches,
};
