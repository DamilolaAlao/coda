import { expect, it } from "@effect/vitest";
import { describe } from "vite-plus/test";

import {
  assetResponseHeaders,
  isLoopbackHostname,
  resolveDevRedirectUrl,
  shouldSpaFallbackMissingFile,
  staticFileCacheControl,
} from "./http.ts";

describe("http dev routing", () => {
  it("treats localhost and loopback addresses as local", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("does not treat LAN addresses as local", () => {
    expect(isLoopbackHostname("192.168.86.35")).toBe(false);
    expect(isLoopbackHostname("10.0.0.24")).toBe(false);
    expect(isLoopbackHostname("example.local")).toBe(false);
  });

  it("preserves path and query when redirecting to the dev server", () => {
    const devUrl = new URL("http://127.0.0.1:5173/");
    const requestUrl = new URL("http://127.0.0.1:3774/pair?token=test-token");

    expect(resolveDevRedirectUrl(devUrl, requestUrl)).toBe(
      "http://127.0.0.1:5173/pair?token=test-token",
    );
  });
});

describe("assetResponseHeaders", () => {
  it("sandboxes SVG assets", () => {
    expect(assetResponseHeaders("/attachments/user-image.svg")).toMatchObject({
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });
    expect(assetResponseHeaders("/attachments/user-image.SVG")).toHaveProperty(
      "Content-Security-Policy",
    );
  });

  it("does not apply document policy to raster images", () => {
    expect(assetResponseHeaders("/attachments/user-image.png")).toEqual({
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
  });
});

describe("static SPA fallback", () => {
  it("keeps client routes on the SPA index", () => {
    expect(shouldSpaFallbackMissingFile("/")).toBe(true);
    expect(shouldSpaFallbackMissingFile("/pair")).toBe(true);
    expect(shouldSpaFallbackMissingFile("/settings")).toBe(true);
    expect(shouldSpaFallbackMissingFile("/thread/abc")).toBe(true);
  });

  it("does not treat missing hashed assets as the SPA index", () => {
    expect(shouldSpaFallbackMissingFile("/assets/DiffPanel-BkgrAD6v.js")).toBe(false);
    expect(shouldSpaFallbackMissingFile("/assets/index-V3JMfx7D.css")).toBe(false);
    expect(shouldSpaFallbackMissingFile("/favicon.ico")).toBe(false);
    expect(shouldSpaFallbackMissingFile("/harnesses/claude.svg")).toBe(false);
  });
});

describe("staticFileCacheControl", () => {
  it("keeps HTML fresh and hashed assets immutable", () => {
    expect(staticFileCacheControl("/")).toBe("no-cache");
    expect(staticFileCacheControl("/index.html")).toBe("no-cache");
    expect(staticFileCacheControl("/assets/DiffPanel-C3rx-Y7P.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(staticFileCacheControl("/harnesses/claude.svg")).toBe("public, max-age=3600");
  });
});
