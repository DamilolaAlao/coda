import { describe, expect, it } from "vite-plus/test";

import {
  applyHermesProviderRoutingYaml,
  isOpenRouterBaseUrl,
  mergeHermesCatalogModels,
  openAiCompatibleModelsUrl,
  parseOpenAiCompatibleModelsResponse,
  parseProviderSlugList,
  normalizeProviderSort,
  resolveHermesOpenAiEndpoint,
} from "./hermesOpenAiCompat.ts";

describe("hermesOpenAiCompat", () => {
  it("parses preferred provider slugs", () => {
    expect(parseProviderSlugList(" anthropic, OpenAI, anthropic\n together ")).toEqual([
      "anthropic",
      "openai",
      "together",
    ]);
    expect(normalizeProviderSort("Throughput")).toBe("throughput");
    expect(normalizeProviderSort("nope")).toBeUndefined();
  });

  it("detects OpenRouter endpoints", () => {
    expect(isOpenRouterBaseUrl("https://openrouter.ai/api/v1")).toBe(true);
    expect(isOpenRouterBaseUrl("https://opencode.ai/zen/go/v1")).toBe(false);
    expect(openAiCompatibleModelsUrl("https://openrouter.ai/api/v1/")).toBe(
      "https://openrouter.ai/api/v1/models",
    );
    expect(
      resolveHermesOpenAiEndpoint({
        apiKey: "sk-or-v1-test",
        baseUrl: "",
      }),
    ).toEqual({
      kind: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });

  it("parses OpenAI-compatible model lists", () => {
    expect(
      parseOpenAiCompatibleModelsResponse({
        data: [
          { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet" },
          { id: "anthropic/claude-sonnet-4.6" },
          { id: "" },
          { name: "ignored" },
        ],
      }).map((model) => model.slug),
    ).toEqual(["anthropic/claude-sonnet-4.6"]);
  });

  it("upserts a Coda-managed provider_routing block", () => {
    const next = applyHermesProviderRoutingYaml("model:\n  provider: openrouter\n", {
      order: ["anthropic", "openai"],
      sort: "price",
    });
    expect(next).toContain("provider_routing:");
    expect(next).toContain('- "anthropic"');
    const updated = applyHermesProviderRoutingYaml(next, { order: ["google"] });
    expect(updated.match(/provider_routing:/g)?.length).toBe(1);
    expect(updated).toContain('- "google"');
    expect(updated).not.toContain("anthropic");
    const cleared = applyHermesProviderRoutingYaml(updated, { order: [] });
    expect(cleared).not.toContain("coda-provider-routing");
    expect(cleared).toContain("model:");
  });

  it("merges OpenAI-compatible and ACP catalogs without duplicate slugs", () => {
    expect(
      mergeHermesCatalogModels(
        [{ slug: "anthropic/claude-sonnet-4.6", name: "Claude", isCustom: false, capabilities: { optionDescriptors: [] } }],
        [{ slug: "anthropic/claude-sonnet-4.6", name: "Dup", isCustom: false, capabilities: { optionDescriptors: [] } }],
        [{ slug: "openai/gpt-4o-mini", name: "Mini", isCustom: false, capabilities: { optionDescriptors: [] } }],
      ).map((model) => model.slug),
    ).toEqual(["anthropic/claude-sonnet-4.6", "openai/gpt-4o-mini"]);
  });
});
