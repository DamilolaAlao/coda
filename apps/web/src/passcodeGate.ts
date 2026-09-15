import { readPairingJwtAudience } from "@t3tools/shared/pairingJwt";

export function configuredDefaultEnvironmentUrl(): string {
  return import.meta.env.VITE_DEFAULT_ENVIRONMENT_URL?.trim() || "";
}

export function resolvePasscodePairingHost(passcode: string): string | null {
  const audience = readPairingJwtAudience(passcode);
  if (audience) {
    return audience;
  }

  const fallback = configuredDefaultEnvironmentUrl();
  return fallback.length > 0 ? fallback : null;
}
