import { describe, expect, it } from "vite-plus/test";
import * as Option from "effect/Option";

import {
  canDisconnectManagedGitHub,
  githubAuthorizeHref,
  githubAuthSourceLabel,
  GITHUB_OAUTH_MESSAGE_TYPE,
  parseGitHubOAuthCompletionMessage,
  resolveSourceControlProviderReadiness,
  shouldShowHostedGitHubAuthGate,
} from "./SourceControlSettings.logic";

const unauthenticated = {
  status: "unauthenticated" as const,
  account: Option.none(),
  host: Option.some("github.com"),
  detail: Option.none(),
};

describe("GitHub auth presentation", () => {
  it("labels managed OAuth as this client and host CLI as the server fallback", () => {
    expect(githubAuthSourceLabel("managed")).toBe("this client");
    expect(githubAuthSourceLabel("host")).toBe("server CLI");
    expect(githubAuthSourceLabel(undefined)).toBeNull();
  });

  it("only disconnects a managed tenant credential", () => {
    expect(
      canDisconnectManagedGitHub({
        ...unauthenticated,
        status: "authenticated",
        account: Option.some("octocat"),
        source: "managed",
      }),
    ).toBe(true);
    expect(
      canDisconnectManagedGitHub({
        ...unauthenticated,
        status: "authenticated",
        account: Option.some("octocat"),
        source: "host",
      }),
    ).toBe(false);
    expect(canDisconnectManagedGitHub(unauthenticated)).toBe(false);
  });

  it("treats a pending GitHub scan as checking, not setup required", () => {
    expect(
      resolveSourceControlProviderReadiness({
        pending: true,
        label: "GitHub",
        provider: undefined,
      }),
    ).toEqual({
      ready: false,
      pending: true,
      hint: "Checking GitHub…",
    });
    expect(
      resolveSourceControlProviderReadiness({
        pending: false,
        label: "GitHub",
        provider: undefined,
      }).pending,
    ).toBe(false);
  });

  it("parses popup completion messages without treating other postMessage traffic as GitHub OAuth", () => {
    expect(
      parseGitHubOAuthCompletionMessage({
        type: GITHUB_OAUTH_MESSAGE_TYPE,
        result: "connected",
      }),
    ).toBe("connected");
    expect(
      parseGitHubOAuthCompletionMessage({
        type: GITHUB_OAUTH_MESSAGE_TYPE,
        result: "failed",
      }),
    ).toBe("failed");
    expect(parseGitHubOAuthCompletionMessage({ type: "other", result: "connected" })).toBeNull();
    expect(parseGitHubOAuthCompletionMessage("connected")).toBeNull();
  });

  it("shows the GitHub auth layer until this client is signed in", () => {
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: false,
        githubConnected: false,
        managedOAuthAvailable: null,
      }),
    ).toBe(true);
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: false,
        githubConnected: null,
        managedOAuthAvailable: null,
      }),
    ).toBe(true);
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: false,
        githubConnected: true,
        managedOAuthAvailable: true,
      }),
    ).toBe(false);
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: false,
        githubConnected: false,
        managedOAuthAvailable: true,
      }),
    ).toBe(true);
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: false,
        githubConnected: false,
        managedOAuthAvailable: false,
      }),
    ).toBe(false);
    expect(
      shouldShowHostedGitHubAuthGate({
        pairingRoute: true,
        githubConnected: false,
        managedOAuthAvailable: true,
      }),
    ).toBe(false);
  });

  it("only opens GitHub.com HTTPS authorize URLs", () => {
    expect(
      githubAuthorizeHref("https://github.com/login/oauth/authorize?client_id=Iv23abc"),
    ).toContain("https://github.com/login/oauth/authorize");
    expect(githubAuthorizeHref("/login/oauth/authorize?client_id=Iv23abc")).toBeNull();
    expect(githubAuthorizeHref("https://www.iointel.dev/login/oauth/authorize")).toBeNull();
  });
});
