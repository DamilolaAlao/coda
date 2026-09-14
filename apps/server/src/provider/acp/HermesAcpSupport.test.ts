import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";

import {
  applyHermesAcpModelSelection,
  buildHermesAcpSpawnInput,
  HERMES_DEFAULT_MODEL,
  resolveHermesAcpBaseModelId,
} from "./HermesAcpSupport.ts";

describe("resolveHermesAcpBaseModelId", () => {
  it("falls back to the Hermes default model", () => {
    expect(resolveHermesAcpBaseModelId(undefined)).toBe(HERMES_DEFAULT_MODEL);
    expect(resolveHermesAcpBaseModelId("   ")).toBe(HERMES_DEFAULT_MODEL);
    expect(resolveHermesAcpBaseModelId("  kimi-k3  ")).toBe("kimi-k3");
    expect(resolveHermesAcpBaseModelId("  opencode-go/kimi-k3  ")).toBe("kimi-k3");
  });
});

describe("buildHermesAcpSpawnInput", () => {
  it("spawns `hermes acp` with the configured binary", () => {
    const spawn = buildHermesAcpSpawnInput(
      { binaryPath: "/usr/local/bin/hermes" },
      "/tmp/project",
      { PATH: "/usr/bin" },
    );

    expect(spawn).toEqual({
      command: "/usr/local/bin/hermes",
      args: ["acp"],
      cwd: "/tmp/project",
      env: { PATH: "/usr/bin" },
    });
  });

  it("injects OpenCode Go credentials into the ACP spawn env", () => {
    const spawn = buildHermesAcpSpawnInput(
      {
        binaryPath: "/usr/local/bin/hermes",
        openCodeGoApiKey: " sk-go ",
        openCodeGoBaseUrl: "",
      },
      "/tmp/project",
      { PATH: "/usr/bin" },
    );

    expect(spawn).toEqual({
      command: "/usr/local/bin/hermes",
      args: ["acp"],
      cwd: "/tmp/project",
      env: {
        PATH: "/usr/bin",
        OPENCODE_GO_API_KEY: "sk-go",
        OPENCODE_GO_BASE_URL: "https://opencode.ai/zen/go/v1",
      },
    });
  });

  it("defaults the command to hermes when no binary path is set", () => {
    const spawn = buildHermesAcpSpawnInput(undefined, "/tmp/project");
    expect(spawn.command).toBe("hermes");
    expect(spawn.args).toEqual(["acp"]);
    expect(spawn.env).toBeUndefined();
  });
});

describe("applyHermesAcpModelSelection", () => {
  const makeRecordingRuntime = (failure?: EffectAcpErrors.AcpError) => {
    const modelCalls: Array<string> = [];
    const runtime = {
      setSessionModel: (modelId: string) =>
        Effect.gen(function* () {
          modelCalls.push(modelId);
          if (failure) return yield* failure;
          return {};
        }),
    };
    return { runtime, modelCalls };
  };

  it.effect("calls session/set_model when the requested model differs from current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyHermesAcpModelSelection({
        runtime,
        currentModelId: HERMES_DEFAULT_MODEL,
        requestedModelId: "openai/other",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual(["openai/other"]);
      expect(result).toBe("openai/other");
    }),
  );

  it.effect("skips set_model when requested matches current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyHermesAcpModelSelection({
        runtime,
        currentModelId: HERMES_DEFAULT_MODEL,
        requestedModelId: HERMES_DEFAULT_MODEL,
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe(HERMES_DEFAULT_MODEL);
    }),
  );

  it.effect("propagates session/set_model failures via mapError", () =>
    Effect.gen(function* () {
      const failure = EffectAcpErrors.AcpRequestError.invalidParams("session id not known");
      const { runtime } = makeRecordingRuntime(failure);
      const error = yield* Effect.flip(
        applyHermesAcpModelSelection({
          runtime,
          currentModelId: HERMES_DEFAULT_MODEL,
          requestedModelId: "openai/other",
          mapError: (cause) => cause.message,
        }),
      );
      expect(error).toBe(failure.message);
    }),
  );
});
