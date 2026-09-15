import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { canConnectGitHubProvider, resolveAddProjectEnvironment } from "./AddProjectScreen.logic";

const ENVIRONMENT_A = EnvironmentId.make("environment-a");
const ENVIRONMENT_B = EnvironmentId.make("environment-b");

function environment(environmentId: EnvironmentId, connectionState: EnvironmentConnectionPhase) {
  return { environmentId, connectionState };
}

describe("resolveAddProjectEnvironment", () => {
  it("does not redirect an explicit unavailable environment to another environment", () => {
    expect(
      resolveAddProjectEnvironment(
        [environment(ENVIRONMENT_A, "offline"), environment(ENVIRONMENT_B, "connected")],
        ENVIRONMENT_A,
      ),
    ).toBeNull();
  });

  it("resolves an explicit connected environment", () => {
    expect(
      resolveAddProjectEnvironment(
        [environment(ENVIRONMENT_A, "connected"), environment(ENVIRONMENT_B, "connected")],
        ENVIRONMENT_A,
      )?.environmentId,
    ).toBe(ENVIRONMENT_A);
  });

  it("defaults to the first connected environment when no environment is requested", () => {
    expect(
      resolveAddProjectEnvironment(
        [environment(ENVIRONMENT_A, "offline"), environment(ENVIRONMENT_B, "connected")],
        null,
      )?.environmentId,
    ).toBe(ENVIRONMENT_B);
  });
});

describe("canConnectGitHubProvider", () => {
  it("offers Connect GitHub only when the CLI is present and this client is not signed in", () => {
    expect(canConnectGitHubProvider(undefined)).toBe(false);
    expect(
      canConnectGitHubProvider({
        kind: "github",
        label: "GitHub",
        status: "available",
        version: Option.none(),
        installHint: "brew install gh",
        detail: Option.none(),
        auth: {
          status: "unauthenticated",
          account: Option.none(),
          host: Option.some("github.com"),
          detail: Option.none(),
        },
      }),
    ).toBe(true);
    expect(
      canConnectGitHubProvider({
        kind: "github",
        label: "GitHub",
        status: "available",
        version: Option.none(),
        installHint: "brew install gh",
        detail: Option.none(),
        auth: {
          status: "authenticated",
          account: Option.some("octocat"),
          host: Option.some("github.com"),
          detail: Option.none(),
          source: "managed",
        },
      }),
    ).toBe(false);
  });
});
