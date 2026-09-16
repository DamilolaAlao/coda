export const STALE_CHUNK_RELOAD_KEY = "coda:stale-chunk-reload";
export const STALE_CHUNK_RELOAD_PARAM = "_r";

const STALE_CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS|Loading chunk [\w.-]+ failed|MIME type of ["']text\/html["']/i;

export function isStaleChunkLoadError(error: unknown): boolean {
  const message = staleChunkErrorMessage(error);
  return STALE_CHUNK_MESSAGE.test(message);
}

export function withStaleChunkCacheBust(href: string, now: number): string {
  const url = new URL(href);
  url.searchParams.set(STALE_CHUNK_RELOAD_PARAM, String(now));
  return url.href;
}

export function withoutStaleChunkCacheBust(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(STALE_CHUNK_RELOAD_PARAM)) {
    return null;
  }
  url.searchParams.delete(STALE_CHUNK_RELOAD_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function recoverFromStaleChunkLoad(input: {
  readonly error: unknown;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly reload: () => void;
}): boolean {
  if (!isStaleChunkLoadError(input.error) || input.storage == null) {
    return false;
  }
  if (input.storage.getItem(STALE_CHUNK_RELOAD_KEY) === "1") {
    return false;
  }
  input.storage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
  input.reload();
  return true;
}

export function clearStaleChunkReload(storage: Pick<Storage, "removeItem"> | null): void {
  storage?.removeItem(STALE_CHUNK_RELOAD_KEY);
}

function staleChunkErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}
