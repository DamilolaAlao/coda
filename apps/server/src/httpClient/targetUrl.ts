const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function parseHttpClientTargetUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (!ALLOWED_PROTOCOLS.has(url.protocol) || url.hostname.length === 0) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
