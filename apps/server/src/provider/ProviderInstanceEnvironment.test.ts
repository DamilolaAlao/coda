import { describe, expect, it } from "vite-plus/test";

import { mergeProviderInstanceEnvironment } from "./ProviderInstanceEnvironment.ts";

describe("mergeProviderInstanceEnvironment", () => {
  it("overrides inherited environment values and preserves empty strings", () => {
    expect(
      mergeProviderInstanceEnvironment(
        [
          { name: "OPENROUTER_API_KEY", value: "sk-or-test", sensitive: true },
          { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
        ],
        { ANTHROPIC_API_KEY: "inherited", PATH: "/bin" },
      ),
    ).toMatchObject({
      OPENROUTER_API_KEY: "sk-or-test",
      ANTHROPIC_API_KEY: "",
      PATH: "/bin",
    });
  });

  it("scrubs host runtime secrets even when no instance overlay is set", () => {
    expect(
      mergeProviderInstanceEnvironment(undefined, {
        PATH: "/bin",
        T3CODE_HOME: "/home/zerops/.t3",
        ZEROPS_TOKEN: "secret",
      }),
    ).toEqual({
      PATH: "/bin",
    });
  });
});
