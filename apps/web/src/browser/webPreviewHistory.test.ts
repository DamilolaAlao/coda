import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_WEB_PREVIEW_HISTORY,
  readWebPreviewHistory,
  recordWebPreviewVisit,
  webPreviewBack,
  webPreviewCanGoBack,
  webPreviewCanGoForward,
  webPreviewForward,
  writeWebPreviewHistory,
} from "./webPreviewHistory";

describe("web preview history", () => {
  it("records visits and trims the forward stack on a new branch", () => {
    const first = recordWebPreviewVisit(EMPTY_WEB_PREVIEW_HISTORY, "https://a.example/");
    const second = recordWebPreviewVisit(first, "https://b.example/");
    const back = webPreviewBack(second);
    if (!back) throw new Error("expected back");
    const branched = recordWebPreviewVisit(back.history, "https://c.example/");

    expect(first).toEqual({ stack: ["https://a.example/"], index: 0 });
    expect(webPreviewCanGoBack(second)).toBe(true);
    expect(webPreviewCanGoForward(second)).toBe(false);
    expect(back.url).toBe("https://a.example/");
    expect(webPreviewCanGoForward(back.history)).toBe(true);
    expect(branched.stack).toEqual(["https://a.example/", "https://c.example/"]);
    expect(webPreviewCanGoForward(branched)).toBe(false);
  });

  it("ignores blank or duplicate current URLs", () => {
    const first = recordWebPreviewVisit(EMPTY_WEB_PREVIEW_HISTORY, "https://a.example/");
    expect(recordWebPreviewVisit(first, "  ")).toBe(first);
    expect(recordWebPreviewVisit(first, "https://a.example/")).toBe(first);
  });

  it("walks forward after going back", () => {
    const history = recordWebPreviewVisit(
      recordWebPreviewVisit(EMPTY_WEB_PREVIEW_HISTORY, "https://a.example/"),
      "https://b.example/",
    );
    const back = webPreviewBack(history);
    if (!back) throw new Error("expected back");
    const forward = webPreviewForward(back.history);
    expect(forward?.url).toBe("https://b.example/");
    expect(webPreviewBack(EMPTY_WEB_PREVIEW_HISTORY)).toBeNull();
    expect(webPreviewForward(history)).toBeNull();
  });

  it("round-trips history through durable storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };
    const history = recordWebPreviewVisit(
      recordWebPreviewVisit(EMPTY_WEB_PREVIEW_HISTORY, "https://a.example/"),
      "https://b.example/",
    );

    writeWebPreviewHistory("env:thread", "tab_1", history, adapter);
    expect(readWebPreviewHistory("env:thread", "tab_1", adapter)).toEqual(history);
    expect(readWebPreviewHistory("env:thread", "tab_other", adapter)).toEqual(EMPTY_WEB_PREVIEW_HISTORY);
  });
});
