import {
  type HermesSettings,
  HERMES_DEFAULT_MODEL,
  HERMES_OPENCODE_GO_API_KEY_ENV,
  HERMES_OPENCODE_GO_BASE_URL,
  HERMES_OPENCODE_GO_BASE_URL_ENV,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as NodePath from "node:path";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { normalizeModelSlug } from "@t3tools/shared/model";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

export { HERMES_DEFAULT_MODEL };

const HERMES_DRIVER_KIND = ProviderDriverKind.make("hermes");
const HERMES_AUTH_METHOD_CUSTOM = "custom";

type HermesAcpRuntimeHermesSettings = Pick<
  HermesSettings,
  "binaryPath" | "openCodeGoApiKey" | "openCodeGoBaseUrl"
>;

interface HermesAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly hermesSettings: HermesAcpRuntimeHermesSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

function pathEnvKey(environment: NodeJS.ProcessEnv): string {
  return Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function withHermesBinaryOnPath(
  command: string,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (!NodePath.isAbsolute(command)) {
    return environment;
  }
  const dir = NodePath.dirname(command);
  const key = pathEnvKey(environment);
  const current = environment[key] ?? "";
  if (current.split(NodePath.delimiter).includes(dir)) {
    return environment;
  }
  return {
    ...environment,
    [key]: current.length > 0 ? `${dir}${NodePath.delimiter}${current}` : dir,
  };
}

export function buildHermesRuntimeEnvironment(
  hermesSettings: HermesAcpRuntimeHermesSettings | null | undefined,
  environment?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv | undefined {
  const command = hermesSettings?.binaryPath || "hermes";
  const apiKey = hermesSettings?.openCodeGoApiKey?.trim();
  const baseUrl = hermesSettings?.openCodeGoBaseUrl?.trim();
  const needsOverlay = Boolean(apiKey || baseUrl || NodePath.isAbsolute(command));
  if (!needsOverlay) {
    return environment;
  }

  let next: NodeJS.ProcessEnv = { ...(environment ?? {}) };
  next = withHermesBinaryOnPath(command, next);
  if (apiKey) {
    next[HERMES_OPENCODE_GO_API_KEY_ENV] = apiKey;
  }
  if (baseUrl) {
    next[HERMES_OPENCODE_GO_BASE_URL_ENV] = baseUrl;
  } else if (apiKey && !next[HERMES_OPENCODE_GO_BASE_URL_ENV]) {
    next[HERMES_OPENCODE_GO_BASE_URL_ENV] = HERMES_OPENCODE_GO_BASE_URL;
  }
  return next;
}

export function buildHermesAcpSpawnInput(
  hermesSettings: HermesAcpRuntimeHermesSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  const env = buildHermesRuntimeEnvironment(hermesSettings, environment);
  return {
    command: hermesSettings?.binaryPath || "hermes",
    args: ["acp"],
    cwd,
    ...(env ? { env } : {}),
  };
}

export const makeHermesAcpRuntime = (
  input: HermesAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildHermesAcpSpawnInput(input.hermesSettings, input.cwd, input.environment),
        authMethodId: HERMES_AUTH_METHOD_CUSTOM,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolveHermesAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : HERMES_DEFAULT_MODEL;
  return normalizeModelSlug(base, HERMES_DRIVER_KIND) ?? HERMES_DEFAULT_MODEL;
}

export function currentHermesModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  return sessionSetupResult.models?.currentModelId?.trim() || undefined;
}

export function applyHermesAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "setSessionModel">;
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<string | undefined, E> {
  const shouldSwitchModel =
    input.requestedModelId !== undefined && input.requestedModelId !== input.currentModelId;
  if (!shouldSwitchModel) {
    return Effect.succeed(input.currentModelId);
  }
  return input.runtime
    .setSessionModel(input.requestedModelId)
    .pipe(Effect.mapError(input.mapError), Effect.as(input.requestedModelId));
}
