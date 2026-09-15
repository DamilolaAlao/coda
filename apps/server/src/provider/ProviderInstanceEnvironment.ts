import type { ProviderInstanceEnvironment } from "@t3tools/contracts";

import { scrubHostRuntimeEnv } from "../process/hostRuntimeEnv.ts";

export function mergeProviderInstanceEnvironment(
  environment: ProviderInstanceEnvironment | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next = scrubHostRuntimeEnv(baseEnv);
  if (!environment || environment.length === 0) {
    return next;
  }

  for (const variable of environment) {
    next[variable.name] = variable.value;
  }
  return next;
}
