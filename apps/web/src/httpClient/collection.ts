import type { HttpClientDraft } from "./buildRequest";
import { newHttpClientDraft } from "./buildRequest";

const storageKey = (environmentId: string) => `t3code:http-client:${environmentId}`;

export interface HttpClientCollection {
  activeId: string;
  requests: HttpClientDraft[];
}

export function emptyHttpClientCollection(): HttpClientCollection {
  const request = newHttpClientDraft();
  return { activeId: request.id, requests: [request] };
}

export function loadHttpClientCollection(environmentId: string): HttpClientCollection {
  if (typeof localStorage === "undefined") return emptyHttpClientCollection();
  try {
    const raw = localStorage.getItem(storageKey(environmentId));
    if (raw === null) return emptyHttpClientCollection();
    const parsed = JSON.parse(raw) as HttpClientCollection;
    if (!Array.isArray(parsed.requests) || parsed.requests.length === 0) {
      return emptyHttpClientCollection();
    }
    const activeId =
      typeof parsed.activeId === "string" && parsed.requests.some((request) => request.id === parsed.activeId)
        ? parsed.activeId
        : parsed.requests[0]!.id;
    return { activeId, requests: parsed.requests };
  } catch {
    return emptyHttpClientCollection();
  }
}

export function saveHttpClientCollection(environmentId: string, collection: HttpClientCollection): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(environmentId), JSON.stringify(collection));
}
