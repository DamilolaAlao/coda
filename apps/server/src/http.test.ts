import { expect, it } from "@effect/vitest";
import { describe } from "vite-plus/test";

import {
  assetResponseHeaders,
  isLoopbackHostname,
  resolveDevRedirectUrl,
  shouldSpaFallbackMissingFile,
  staticCacheHeaders,
  staticFileCacheControl,
  uncacheableHeaders,
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
    expect(shouldSpaFallbackMissingFile("/api/auth/github/callback")).toBe(false);
    expect(shouldSpaFallbackMissingFile("/api/missing")).toBe(false);
  });
});

describe("staticFileCacheControl", () => {
  it("caches only hashed Vite assets and leaves everything else uncached", () => {
    expect(staticFileCacheControl("/")).toBe("no-store");
    expect(staticFileCacheControl("/index.html")).toBe("no-store");
    expect(staticFileCacheControl("/pair")).toBe("no-store");
    expect(staticFileCacheControl("/harnesses/claude.svg")).toBe("no-store");
    expect(staticFileCacheControl("/favicon.ico")).toBe("no-store");
    expect(staticFileCacheControl("/assets/DiffPanel-C3rx-Y7P.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("tells browsers and Cloudflare not to store HTML or misses", () => {
    expect(uncacheableHeaders()).toMatchObject({
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    expect(staticCacheHeaders("/assets/index-DekXhs1b.js")).toMatchObject({
      "Cache-Control": "public, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
    });
  });
});
