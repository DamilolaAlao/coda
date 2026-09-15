import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import {
  HERMES_OPENCODE_GO_BASE_URL,
  HERMES_OPENROUTER_BASE_URL,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";

const EMPTY_CAPABILITIES = createModelCapabilities({ optionDescriptors: [] });
const CODA_ROUTING_START = "# coda-provider-routing-start";
const CODA_ROUTING_END = "# coda-provider-routing-end";
const PROVIDER_SORTS = new Set(["price", "throughput", "latency"]);

export function parseProviderSlugList(raw: string | undefined): ReadonlyArray<string> {
  if (!raw) return [];
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const slug = part.trim().toLowerCase();
    if (slug.length === 0 || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

export function normalizeProviderSort(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value || !PROVIDER_SORTS.has(value)) return undefined;
  return value;
}

export function isOpenRouterBaseUrl(raw: string | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

export function isOpenRouterApiKey(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase().startsWith("sk-or-") === true;
}

export function resolveHermesOpenAiEndpoint(input: {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}): { readonly kind: "openrouter" | "openai-compat"; readonly baseUrl: string } | undefined {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) return undefined;
  const baseUrl = input.baseUrl?.trim();
  if (isOpenRouterBaseUrl(baseUrl) || (!baseUrl && isOpenRouterApiKey(apiKey))) {
    return { kind: "openrouter", baseUrl: baseUrl || HERMES_OPENROUTER_BASE_URL };
  }
  return { kind: "openai-compat", baseUrl: baseUrl || HERMES_OPENCODE_GO_BASE_URL };
}

export function resolveHermesHome(environment?: NodeJS.ProcessEnv): string {
  const fromEnv = environment?.HERMES_HOME?.trim();
  if (fromEnv) return fromEnv;
  return NodePath.join(NodeOs.homedir(), ".hermes");
}

export function mergeHermesCatalogModels(
  ...groups: ReadonlyArray<ReadonlyArray<ServerProviderModel>>
): ReadonlyArray<ServerProviderModel> {
  const seen = new Set<string>();
  const models: ServerProviderModel[] = [];
  for (const group of groups) {
    for (const model of group) {
      if (seen.has(model.slug)) continue;
      seen.add(model.slug);
      models.push(model);
    }
  }
  return models;
}

export function openAiCompatibleModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return `${trimmed}/models`;
}

export function parseOpenAiCompatibleModelsResponse(
  payload: unknown,
): ReadonlyArray<ServerProviderModel> {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const models: ServerProviderModel[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name =
      typeof (entry as { name?: unknown }).name === "string" && (entry as { name: string }).name.trim().length > 0
        ? (entry as { name: string }).name.trim()
        : id;
    models.push({
      slug: id,
      name,
      isCustom: false,
      capabilities: EMPTY_CAPABILITIES,
    });
  }
  return models;
}

export async function fetchOpenAiCompatibleModels(input: {
  readonly baseUrl: string;
  readonly apiKey: string;
}): Promise<ReadonlyArray<ServerProviderModel>> {
  const response = await fetch(openAiCompatibleModelsUrl(input.baseUrl), {
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`OpenAI-compatible /models returned ${response.status}`);
  }
  return parseOpenAiCompatibleModelsResponse(await response.json());
}

export function renderHermesProviderRoutingBlock(input: {
  readonly order: ReadonlyArray<string>;
  readonly sort?: string;
}): string {
  const lines = [CODA_ROUTING_START, "provider_routing:"];
  if (input.sort) {
    lines.push(`  sort: ${JSON.stringify(input.sort)}`);
  }
  if (input.order.length > 0) {
    lines.push("  order:");
    for (const slug of input.order) {
      lines.push(`    - ${JSON.stringify(slug)}`);
    }
  }
  lines.push(CODA_ROUTING_END);
  return `${lines.join("\n")}\n`;
}

const MANAGED_ROUTING_BLOCK_RE = new RegExp(
  `(?:\\n)?${CODA_ROUTING_START}[\\s\\S]*?${CODA_ROUTING_END}\\n?`,
  "g",
);

export function applyHermesProviderRoutingYaml(
  existing: string,
  input: { readonly order: ReadonlyArray<string>; readonly sort?: string },
): string {
  if (input.order.length === 0 && !input.sort) {
    return existing.replace(MANAGED_ROUTING_BLOCK_RE, "\n").replace(/\n{3,}/g, "\n\n");
  }
  const block = renderHermesProviderRoutingBlock(input);
  if (existing.includes(CODA_ROUTING_START) && existing.includes(CODA_ROUTING_END)) {
    return existing.replace(
      new RegExp(`${CODA_ROUTING_START}[\\s\\S]*?${CODA_ROUTING_END}\\n?`),
      block,
    );
  }
  const trimmed = existing.trimEnd();
  return `${trimmed}${trimmed.length > 0 ? "\n\n" : ""}${block}`;
}

export function syncHermesProviderRoutingConfig(input: {
  readonly hermesHome: string;
  readonly order: ReadonlyArray<string>;
  readonly sort?: string;
}): void {
  const configPath = NodePath.join(input.hermesHome, "config.yaml");
  let existing = "";
  try {
    existing = NodeFs.readFileSync(configPath, "utf8");
  } catch {
    existing = "";
  }
  const next = applyHermesProviderRoutingYaml(existing, input);
  if (next === existing) {
    return;
  }
  if (input.order.length === 0 && !input.sort && existing.length === 0) {
    return;
  }
  NodeFs.mkdirSync(input.hermesHome, { recursive: true });
  NodeFs.writeFileSync(configPath, next, "utf8");
}
