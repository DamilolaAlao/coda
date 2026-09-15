export type WebPreviewHistory = {
  readonly stack: readonly string[];
  readonly index: number;
};

export const EMPTY_WEB_PREVIEW_HISTORY: WebPreviewHistory = {
  stack: [],
  index: -1,
};

export function recordWebPreviewVisit(history: WebPreviewHistory, url: string): WebPreviewHistory {
  const nextUrl = url.trim();
  if (!nextUrl) return history;
  if (history.stack[history.index] === nextUrl) return history;
  const stack = [...history.stack.slice(0, history.index + 1), nextUrl];
  return { stack, index: stack.length - 1 };
}

export function webPreviewCanGoBack(history: WebPreviewHistory): boolean {
  return history.index > 0;
}

export function webPreviewCanGoForward(history: WebPreviewHistory): boolean {
  return history.index >= 0 && history.index < history.stack.length - 1;
}

export function webPreviewBack(
  history: WebPreviewHistory,
): { readonly history: WebPreviewHistory; readonly url: string } | null {
  if (!webPreviewCanGoBack(history)) return null;
  const index = history.index - 1;
  const url = history.stack[index];
  if (!url) return null;
  return { history: { stack: history.stack, index }, url };
}

export function webPreviewForward(
  history: WebPreviewHistory,
): { readonly history: WebPreviewHistory; readonly url: string } | null {
  if (!webPreviewCanGoForward(history)) return null;
  const index = history.index + 1;
  const url = history.stack[index];
  if (!url) return null;
  return { history: { stack: history.stack, index }, url };
}

const WEB_PREVIEW_HISTORY_KEY = "t3code:web-preview-history:v1";
const WEB_PREVIEW_HISTORY_MAX_STACK = 50;

function historyStorageKey(threadKey: string, tabId: string): string {
  return `${threadKey}\u0000${tabId}`;
}

function isWebPreviewHistory(value: unknown): value is WebPreviewHistory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { stack?: unknown; index?: unknown };
  if (!Array.isArray(candidate.stack) || typeof candidate.index !== "number") return false;
  if (!Number.isInteger(candidate.index)) return false;
  if (!candidate.stack.every((entry) => typeof entry === "string" && entry.length > 0)) return false;
  return candidate.index >= -1 && candidate.index < candidate.stack.length;
}

export function readWebPreviewHistory(
  threadKey: string,
  tabId: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): WebPreviewHistory {
  if (!storage) return EMPTY_WEB_PREVIEW_HISTORY;
  try {
    const raw = storage.getItem(WEB_PREVIEW_HISTORY_KEY);
    if (!raw) return EMPTY_WEB_PREVIEW_HISTORY;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const history = parsed[historyStorageKey(threadKey, tabId)];
    return isWebPreviewHistory(history) ? history : EMPTY_WEB_PREVIEW_HISTORY;
  } catch {
    return EMPTY_WEB_PREVIEW_HISTORY;
  }
}

export function writeWebPreviewHistory(
  threadKey: string,
  tabId: string,
  history: WebPreviewHistory,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(WEB_PREVIEW_HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const key = historyStorageKey(threadKey, tabId);
    if (history.stack.length === 0) {
      delete parsed[key];
    } else {
      const stack = history.stack.slice(-WEB_PREVIEW_HISTORY_MAX_STACK);
      const dropped = history.stack.length - stack.length;
      parsed[key] = {
        stack,
        index: Math.max(-1, Math.min(history.index - dropped, stack.length - 1)),
      };
    }
    if (Object.keys(parsed).length === 0) {
      storage.removeItem(WEB_PREVIEW_HISTORY_KEY);
      return;
    }
    storage.setItem(WEB_PREVIEW_HISTORY_KEY, JSON.stringify(parsed));
  } catch {
    // Private mode can reject storage writes.
  }
}
