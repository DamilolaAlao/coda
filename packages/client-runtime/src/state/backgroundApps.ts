import {
  type BackgroundAppEvent,
  type BackgroundAppListResult,
  type BackgroundAppSnapshot,
  WS_METHODS,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export interface BackgroundAppClientState {
  readonly apps: ReadonlyMap<string, BackgroundAppSnapshot>;
  readonly revision: number;
  readonly serverEpoch: string | null;
}

export const EMPTY_BACKGROUND_APP_STATE: BackgroundAppClientState = {
  apps: new Map(),
  revision: 0,
  serverEpoch: null,
};

export function hydrateBackgroundApps(result: BackgroundAppListResult): BackgroundAppClientState {
  return {
    apps: new Map(result.apps.map((app) => [app.id, app])),
    revision: result.revision,
    serverEpoch: result.serverEpoch,
  };
}

export function applyBackgroundAppEvent(
  state: BackgroundAppClientState,
  event: BackgroundAppEvent,
): BackgroundAppClientState {
  const epochChanged = state.serverEpoch !== null && state.serverEpoch !== event.serverEpoch;
  if (!epochChanged && event.revision <= state.revision) return state;
  const apps = epochChanged ? new Map<string, BackgroundAppSnapshot>() : new Map(state.apps);
  apps.set(event.snapshot.id, event.snapshot);
  return { apps, revision: event.revision, serverEpoch: event.serverEpoch };
}

export function groupBackgroundApps(apps: ReadonlyArray<BackgroundAppSnapshot>): {
  readonly active: ReadonlyArray<BackgroundAppSnapshot>;
  readonly idle: ReadonlyArray<BackgroundAppSnapshot>;
} {
  const active: BackgroundAppSnapshot[] = [];
  const idle: BackgroundAppSnapshot[] = [];
  for (const app of apps) {
    if (app.status === "stopped" || app.status === "failed") idle.push(app);
    else active.push(app);
  }
  return { active, idle };
}

export function backgroundAppStatusLabel(status: BackgroundAppSnapshot["status"]): string {
  switch (status) {
    case "starting":
      return "Starting…";
    case "running":
      return "Running";
    case "stopping":
      return "Stopping…";
    case "stopped":
      return "Stopped";
    case "failed":
      return "Failed";
  }
}

export function isBackgroundAppTransitionalStatus(
  status: BackgroundAppSnapshot["status"],
): boolean {
  return status === "starting" || status === "stopping";
}

export function backgroundAppProgressHint(app: {
  readonly status: BackgroundAppSnapshot["status"];
  readonly endpoints: ReadonlyArray<unknown>;
}): string | null {
  if (app.status === "starting" && app.endpoints.length === 0) {
    return "Waiting for a listening port…";
  }
  if (app.status === "stopping") {
    return "Shutting down…";
  }
  return null;
}

export function matchBackgroundAppForServer(
  apps: ReadonlyArray<BackgroundAppSnapshot>,
  server: {
    readonly port: number;
    readonly terminal?: { readonly threadId: string; readonly terminalId: string } | null;
  },
): BackgroundAppSnapshot | null {
  if (!server.terminal) return null;
  return (
    apps.find(
      (app) =>
        app.threadId === server.terminal?.threadId &&
        app.terminalId === server.terminal.terminalId &&
        (app.endpoints.some((endpoint) => endpoint.port === server.port) ||
          app.endpoints.length === 0),
    ) ?? null
  );
}

export function createBackgroundAppEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const lifecycleScheduler = createAtomCommandScheduler();

  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:background-apps:list",
      tag: WS_METHODS.backgroundAppsList,
      staleTimeMs: 3_000,
      idleTtlMs: 0,
    }),
    events: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:background-apps:events",
      tag: WS_METHODS.subscribeBackgroundApps,
      idleTtlMs: 0,
    }),
    logs: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:background-apps:logs",
      tag: WS_METHODS.backgroundAppsLogs,
      idleTtlMs: 0,
    }),
    start: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:background-apps:start",
      tag: WS_METHODS.backgroundAppsStart,
      scheduler: lifecycleScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.id ?? input.scriptId ?? input.threadId]),
      },
    }),
    stop: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:background-apps:stop",
      tag: WS_METHODS.backgroundAppsStop,
      scheduler: lifecycleScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.appId]),
      },
    }),
    restart: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:background-apps:restart",
      tag: WS_METHODS.backgroundAppsRestart,
      scheduler: lifecycleScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.appId]),
      },
    }),
  };
}
