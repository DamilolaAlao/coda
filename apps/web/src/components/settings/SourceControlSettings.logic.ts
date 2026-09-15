import type {
  SourceControlGitHubAuthSource,
  SourceControlProviderAuth,
} from "@t3tools/contracts";

export const GITHUB_OAUTH_MESSAGE_TYPE = "t3.github-oauth";

export function githubAuthSourceLabel(
  source: SourceControlGitHubAuthSource | undefined,
): "this client" | "server CLI" | null {
  if (source === "managed") return "this client";
  if (source === "host") return "server CLI";
  return null;
}

export function canDisconnectManagedGitHub(auth: SourceControlProviderAuth): boolean {
  return auth.status === "authenticated" && auth.source === "managed";
}

export function parseGitHubOAuthCompletionMessage(data: unknown): "connected" | "failed" | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("type" in data) || data.type !== GITHUB_OAUTH_MESSAGE_TYPE) return null;
  return "result" in data && data.result === "connected" ? "connected" : "failed";
}
