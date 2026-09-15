import { describe, expect, it } from "vite-plus/test";

import { parseHttpClientTargetUrl } from "./targetUrl.ts";

describe("parseHttpClientTargetUrl", () => {
  it("accepts http and https URLs", () => {
    expect(parseHttpClientTargetUrl("https://api.example.com/v1")?.href).toBe(
      "https://api.example.com/v1",
    );
    expect(parseHttpClientTargetUrl("http://127.0.0.1:8787/health")?.host).toBe("127.0.0.1:8787");
  });

  it("rejects non-http schemes and empty hosts", () => {
    expect(parseHttpClientTargetUrl("file:///etc/passwd")).toBeNull();
    expect(parseHttpClientTargetUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpClientTargetUrl("not a url")).toBeNull();
  });
});
