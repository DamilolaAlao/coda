import { describe, expect, it } from "vite-plus/test";

import {
  applyQueryToUrl,
  buildHttpClientSendInput,
  formatHttpClientBody,
  newHttpClientDraft,
} from "./buildRequest";

describe("http client request builder", () => {
  it("merges query params and auth into the send payload", () => {
    const draft = newHttpClientDraft({
      method: "POST",
      url: "https://api.example.com/items",
      query: [{ id: "q1", enabled: true, name: "limit", value: "10" }],
      headers: [{ id: "h1", enabled: true, name: "X-Trace", value: "1" }],
      bodyMode: "json",
      body: '{"ok":true}',
      auth: { type: "bearer", token: "secret" },
    });
    expect(buildHttpClientSendInput(draft)).toEqual({
      method: "POST",
      url: "https://api.example.com/items?limit=10",
      headers: [
        { name: "X-Trace", value: "1" },
        { name: "Authorization", value: "Bearer secret" },
        { name: "Content-Type", value: "application/json" },
      ],
      body: '{"ok":true}',
    });
  });

  it("pretty-prints JSON bodies and leaves text alone", () => {
    expect(formatHttpClientBody('{"a":1}')).toBe('{\n  "a": 1\n}\n');
    expect(formatHttpClientBody("not json")).toBe("not json");
  });

  it("drops disabled query rows", () => {
    expect(
      applyQueryToUrl("https://example.com/path", [
        { id: "a", enabled: false, name: "gone", value: "1" },
        { id: "b", enabled: true, name: "keep", value: "2" },
      ]),
    ).toBe("https://example.com/path?keep=2");
  });
});
