import { describe, expect, it } from "vite-plus/test";

import { sanitizeHttpClientHeaders } from "./send.ts";

describe("sanitizeHttpClientHeaders", () => {
  it("drops hop-by-hop and host headers", () => {
    expect(
      sanitizeHttpClientHeaders([
        { name: "Host", value: "evil.example" },
        { name: "X-Trace", value: "1" },
        { name: "Connection", value: "close" },
      ]),
    ).toEqual({ "X-Trace": "1" });
  });
});
