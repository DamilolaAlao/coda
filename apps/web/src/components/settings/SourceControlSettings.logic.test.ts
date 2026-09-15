import { describe, expect, it } from "vite-plus/test";
import * as Option from "effect/Option";

import {
  canDisconnectManagedGitHub,
  githubAuthSourceLabel,
  GITHUB_OAUTH_MESSAGE_TYPE,
  parseGitHubOAuthCompletionMessage,
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
});
