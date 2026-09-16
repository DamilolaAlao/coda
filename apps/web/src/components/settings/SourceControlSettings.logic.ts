import type {
  SourceControlGitHubAuthSource,
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
} from "@t3tools/contracts";
import * as Option from "effect/Option";

export const GITHUB_OAUTH_MESSAGE_TYPE = "t3.github-oauth";
export const GITHUB_OAUTH_POPUP_NAME = "t3-github-oauth";

export function githubAuthSourceLabel(
  source: SourceControlGitHubAuthSource | undefined,
): "this client" | "server CLI" | null {
  if (source === "managed") return "this client";
  if (source === "host") return "server CLI";
  return null;
}

export function isManagedGitHubConnected(auth: SourceControlProviderAuth | undefined): boolean {
  return auth?.status === "authenticated" && auth.source === "managed";
}

export function canDisconnectManagedGitHub(auth: SourceControlProviderAuth): boolean {
  return isManagedGitHubConnected(auth);
}

export type SourceControlProviderReadiness = {
  readonly ready: boolean;
  readonly pending: boolean;
  readonly hint: string | null;
};

export function resolveSourceControlProviderReadiness(input: {
  readonly pending: boolean;
  readonly label: string;
  readonly provider: SourceControlProviderDiscoveryItem | undefined;
}): SourceControlProviderReadiness {
  if (input.pending && input.provider === undefined) {
    return { ready: false, pending: true, hint: `Checking ${input.label}…` };
  }
  if (input.provider === undefined) {
    return {
      ready: false,
      pending: false,
      hint: "Provider status unavailable. Open Settings -> Source Control and rescan.",
    };
  }
  if (input.provider.status !== "available") {
    return { ready: false, pending: false, hint: input.provider.installHint };
  }
  if (input.provider.auth.status === "unauthenticated") {
    return {
      ready: false,
      pending: false,
      hint:
        Option.getOrNull(input.provider.auth.detail) ??
        `${input.provider.label} is not authenticated. Open Settings -> Source Control for setup guidance.`,
    };
  }
  return { ready: true, pending: false, hint: null };
}

export function shouldShowHostedGitHubAuthGate(input: {
  readonly pairingRoute: boolean;
  readonly unlocked: boolean;
  readonly githubConnected: boolean | null;
  readonly managedOAuthAvailable: boolean | null;
}): boolean {
  if (input.pairingRoute || input.githubConnected === true) return false;
  if (input.unlocked) return true;
  return input.managedOAuthAvailable === true;
}

export function parseGitHubOAuthCompletionMessage(data: unknown): "connected" | "failed" | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("type" in data) || data.type !== GITHUB_OAUTH_MESSAGE_TYPE) return null;
  return "result" in data && data.result === "connected" ? "connected" : "failed";
}

export function openGitHubAuthorizePopup(authorizeUrl: string) {
  return new Promise<"connected" | "failed" | "dismissed">((resolve) => {
    const popup = window.open(authorizeUrl, GITHUB_OAUTH_POPUP_NAME, "popup=yes,width=600,height=760");
    if (popup === null) {
      window.location.assign(authorizeUrl);
      return;
    }
    const onMessage = (event: MessageEvent) => {
      const result = parseGitHubOAuthCompletionMessage(event.data);
      if (result === null) return;
      cleanup();
      resolve(result);
    };
    const timer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve("dismissed");
      }
    }, 400);
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
    window.addEventListener("message", onMessage);
  });
}
