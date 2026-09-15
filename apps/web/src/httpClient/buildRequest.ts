import type { HttpClientHeaderPair, HttpClientMethod, HttpClientSendInput } from "@t3tools/contracts";

import { randomHex } from "~/lib/utils";

export type HttpClientAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export interface HttpClientFieldRow {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
}

export interface HttpClientDraft {
  id: string;
  name: string;
  method: HttpClientMethod;
  url: string;
  query: HttpClientFieldRow[];
  headers: HttpClientFieldRow[];
  bodyMode: "none" | "json" | "text";
  body: string;
  auth: HttpClientAuth;
}

export function newFieldRow(): HttpClientFieldRow {
  return { id: randomHex(8), enabled: true, name: "", value: "" };
}

export function newHttpClientDraft(overrides?: Partial<HttpClientDraft>): HttpClientDraft {
  return {
    id: randomHex(8),
    name: "New request",
    method: "GET",
    url: "https://",
    query: [newFieldRow()],
    headers: [newFieldRow()],
    bodyMode: "none",
    body: "",
    auth: { type: "none" },
    ...overrides,
  };
}

function enabledPairs(rows: ReadonlyArray<HttpClientFieldRow>): HttpClientHeaderPair[] {
  return rows.flatMap((row) =>
    row.enabled && row.name.trim().length > 0
      ? [{ name: row.name.trim(), value: row.value }]
      : [],
  );
}

export function applyQueryToUrl(url: string, query: ReadonlyArray<HttpClientFieldRow>): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    for (const row of query) {
      if (!row.enabled || row.name.trim().length === 0) continue;
      parsed.searchParams.append(row.name.trim(), row.value);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function queryRowsFromUrl(url: string): HttpClientFieldRow[] {
  try {
    const parsed = new URL(url.trim());
    const rows = [...parsed.searchParams.entries()].map(([name, value]) => ({
      id: randomHex(8),
      enabled: true,
      name,
      value,
    }));
    return rows.length > 0 ? rows : [newFieldRow()];
  } catch {
    return [newFieldRow()];
  }
}

export function buildHttpClientSendInput(draft: HttpClientDraft): HttpClientSendInput {
  const headers = enabledPairs(draft.headers);
  if (draft.auth.type === "bearer" && draft.auth.token.trim().length > 0) {
    headers.push({ name: "Authorization", value: `Bearer ${draft.auth.token.trim()}` });
  } else if (draft.auth.type === "basic") {
    const token = btoa(`${draft.auth.username}:${draft.auth.password}`);
    headers.push({ name: "Authorization", value: `Basic ${token}` });
  }
  if (draft.bodyMode === "json" && !headers.some((header) => header.name.toLowerCase() === "content-type")) {
    headers.push({ name: "Content-Type", value: "application/json" });
  }
  const url = applyQueryToUrl(draft.url, draft.query);
  return {
    method: draft.method,
    url,
    headers,
    ...(draft.bodyMode !== "none" && draft.body.length > 0 ? { body: draft.body } : {}),
  };
}

export function formatHttpClientBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) return body;
  try {
    return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`;
  } catch {
    return body;
  }
}
