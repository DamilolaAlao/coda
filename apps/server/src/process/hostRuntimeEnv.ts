/**
 * Host-runtime env that must not leak into agent CLIs or terminals.
 * Coda's own SQLite/pairing live in T3CODE_HOME; agent deploys use
 * CODA_DEPLOYMENTS_HOME (XDG_*) so zcli/fly/railway state cannot mix with either.
 */
const HOST_RUNTIME_PREFIXES = ["T3CODE_", "VITE_", "ZEROPS_"] as const;
const HOST_RUNTIME_KEYS = new Set([
  "PORT",
  "ELECTRON_RENDERER_PORT",
  "ELECTRON_RUN_AS_NODE",
  "IMAGE_TAG",
]);

export function isHostRuntimeEnvKey(key: string): boolean {
  const normalized = key.toUpperCase();
  if (HOST_RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  return HOST_RUNTIME_KEYS.has(normalized);
}

export function scrubHostRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (isHostRuntimeEnvKey(key)) continue;
    next[key] = value;
  }

  const deployments = next.CODA_DEPLOYMENTS_HOME?.trim();
  if (deployments && deployments.length > 0) {
    next.XDG_CONFIG_HOME ??= `${deployments}/config`;
    next.XDG_DATA_HOME ??= `${deployments}/share`;
    next.XDG_CACHE_HOME ??= `${deployments}/cache`;
    next.XDG_STATE_HOME ??= `${deployments}/state`;
  }

  return next;
}

/** Explicit child env: inherit a scrubbed host env, never `extendEnv: true`. */
export function childProcessEnvironment(
  overlay: NodeJS.ProcessEnv | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return scrubHostRuntimeEnv({ ...baseEnv, ...overlay });
}
