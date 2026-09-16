export const STALE_CHUNK_RELOAD_KEY = "coda:stale-chunk-reload";

const STALE_CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w.-]+ failed/i;

export function isStaleChunkLoadError(error: unknown): boolean {
  const message = staleChunkErrorMessage(error);
  return STALE_CHUNK_MESSAGE.test(message);
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
