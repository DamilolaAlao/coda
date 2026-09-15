import { describe, expect, it } from "vite-plus/test";

import { isHostRuntimeEnvKey, scrubHostRuntimeEnv, childProcessEnvironment } from "./hostRuntimeEnv.ts";

describe("hostRuntimeEnv", () => {
  it("strips Coda, Vite, and Zerops host keys", () => {
    expect(isHostRuntimeEnvKey("T3CODE_HOME")).toBe(true);
    expect(isHostRuntimeEnvKey("T3CODE_PAIRING_CODE")).toBe(true);
    expect(isHostRuntimeEnvKey("ZEROPS_TOKEN")).toBe(true);
    expect(isHostRuntimeEnvKey("IMAGE_TAG")).toBe(true);
    expect(isHostRuntimeEnvKey("PATH")).toBe(false);
    expect(isHostRuntimeEnvKey("CODA_DEPLOYMENTS_HOME")).toBe(false);
  });

  it("points XDG dirs at the deployments home without copying Coda state", () => {
    const scrubbed = scrubHostRuntimeEnv({
      PATH: "/usr/bin",
      T3CODE_HOME: "/home/zerops/.t3",
      T3CODE_PAIRING_CODE: "246801",
      ZEROPS_TOKEN: "secret",
      IMAGE_TAG: "abc",
      CODA_DEPLOYMENTS_HOME: "/home/zerops/deployments",
      HOME: "/home/zerops/coda",
    });

    expect(scrubbed).toEqual({
      PATH: "/usr/bin",
      CODA_DEPLOYMENTS_HOME: "/home/zerops/deployments",
      HOME: "/home/zerops/coda",
      XDG_CONFIG_HOME: "/home/zerops/deployments/config",
      XDG_DATA_HOME: "/home/zerops/deployments/share",
      XDG_CACHE_HOME: "/home/zerops/deployments/cache",
      XDG_STATE_HOME: "/home/zerops/deployments/state",
    });
  });

  it("builds a complete child env without re-merging process.env", () => {
    expect(
      childProcessEnvironment(
        { PATH: "/custom/bin", T3CODE_PAIRING_CODE: "246801" },
        { PATH: "/usr/bin", T3CODE_HOME: "/secret", HOME: "/home/user" },
      ),
    ).toEqual({
      PATH: "/custom/bin",
      HOME: "/home/user",
    });
  });
});
