import { DEFAULT_HOSTED_APP_URL } from "@t3tools/shared/connectAuth";

import { getPairingTokenFromUrl, setPairingTokenOnUrl } from "./pairingUrl";

export interface HostedPairingRequest {
  readonly host: string;
  readonly token: string;
  readonly label: string;
}

export type HostedAppChannel = "latest" | "nightly";

export function resolvePairingUrl(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";

  const candidates = /^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) ? [trimmed] : [`https://${trimmed}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // try the next candidate
    }
  }

  return "";
}

export function configuredPairingUrl(): string {
  const configured = resolvePairingUrl(
    import.meta.env.VITE_PAIRING_URL || import.meta.env.VITE_DEFAULT_ENVIRONMENT_URL,
  );
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export function configuredHostedAppUrl(): string {
  return import.meta.env.VITE_HOSTED_APP_URL?.trim() || DEFAULT_HOSTED_APP_URL;
}

function configuredBackendUrl(): string {
  return import.meta.env.VITE_HTTP_URL?.trim() || import.meta.env.VITE_WS_URL?.trim() || "";
}

function configuredHostedAppChannel(): HostedAppChannel | null {
  const channel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();
  return channel === "latest" || channel === "nightly" ? channel : null;
}

function originFromUrl(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isHostedStaticApp(url: URL = new URL(window.location.href)): boolean {
  if (configuredBackendUrl()) {
    return false;
  }

  if (configuredHostedAppChannel()) {
    return true;
  }

  const hostedOrigin = originFromUrl(configuredHostedAppUrl());
  return hostedOrigin !== null && url.origin === hostedOrigin;
}

export function readHostedPairingRequest(url: URL = new URL(window.location.href)) {
  const host = url.searchParams.get("host")?.trim() || configuredPairingUrl();
  const token = getPairingTokenFromUrl(url)?.trim() ?? "";
  const label = url.searchParams.get("label")?.trim() ?? "";

  if (!host || !token) {
    return null;
  }

  return {
    host,
    token,
    label,
  } satisfies HostedPairingRequest;
}

export function hasHostedPairingRequest(url: URL = new URL(window.location.href)): boolean {
  return readHostedPairingRequest(url) !== null;
}

export function buildHostedPairingUrl(input: {
  readonly host: string;
  readonly token: string;
  readonly label?: string | null;
}): string {
  const url = new URL("/pair", configuredHostedAppUrl());
  url.searchParams.set("host", input.host);

  const label = input.label?.trim();
  if (label) {
    url.searchParams.set("label", label);
  }

  return setPairingTokenOnUrl(url, input.token).toString();
}

export function buildHostedChannelSelectionUrl(input: {
  readonly channel: HostedAppChannel;
}): string {
  const url = new URL("/__t3code/channel", configuredHostedAppUrl());
  url.searchParams.set("channel", input.channel);
  return url.toString();
}
