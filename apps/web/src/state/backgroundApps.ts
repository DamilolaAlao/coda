import { createBackgroundAppEnvironmentAtoms } from "@t3tools/client-runtime/state/background-apps";

import { connectionAtomRuntime } from "../connection/runtime";

export const backgroundAppEnvironment =
  createBackgroundAppEnvironmentAtoms(connectionAtomRuntime);
