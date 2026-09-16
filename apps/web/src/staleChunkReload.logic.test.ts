import { describe, expect, it } from "vite-plus/test";

import {
  clearStaleChunkReload,
  isStaleChunkLoadError,
  recoverFromStaleChunkLoad,
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_PARAM,
  withoutStaleChunkCacheBust,
  withStaleChunkCacheBust,
} from "./staleChunkReload.logic";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
    removeItem(key: string) {
      delete values[key];
    },
    values,
  };
}

describe("stale chunk reload", () => {
  it("recognizes failed dynamic imports and HTML served as modules", () => {
    expect(
      isStaleChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://www.iointel.dev/assets/DiffPanel-BkgrAD6v.js",
        ),
      ),
    ).toBe(true);
    expect(
      isStaleChunkLoadError(
        new Error(
          'Failed to load module script: Expected a JavaScript module but the server responded with a MIME type of "text/html"',
        ),
      ),
    ).toBe(true);
    expect(isStaleChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads once, then surfaces the error", () => {
    const storage = memoryStorage();
    const reloads: Array<number> = [];

    expect(
      recoverFromStaleChunkLoad({
        error: new TypeError("Failed to fetch dynamically imported module: ./DiffPanel.js"),
        storage,
        reload: () => reloads.push(1),
      }),
    ).toBe(true);
    expect(storage.values[STALE_CHUNK_RELOAD_KEY]).toBe("1");
    expect(reloads).toEqual([1]);

    expect(
      recoverFromStaleChunkLoad({
        error: new TypeError("Failed to fetch dynamically imported module: ./DiffPanel.js"),
        storage,
        reload: () => reloads.push(2),
      }),
    ).toBe(false);
    expect(reloads).toEqual([1]);
  });

  it("busts the document cache key and strips the param after boot", () => {
    const busted = withStaleChunkCacheBust("https://www.iointel.dev/pair#token=abc", 1_700_000_000);
    expect(busted).toContain(`${STALE_CHUNK_RELOAD_PARAM}=1700000000`);
    expect(busted).toContain("#token=abc");
    expect(withoutStaleChunkCacheBust(busted)).toBe("/pair#token=abc");
    expect(withoutStaleChunkCacheBust("https://www.iointel.dev/")).toBeNull();
  });

  it("clears the one-shot guard after a successful boot", () => {
    const storage = memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: "1" });
    clearStaleChunkReload(storage);
    expect(storage.values[STALE_CHUNK_RELOAD_KEY]).toBeUndefined();
  });
});
