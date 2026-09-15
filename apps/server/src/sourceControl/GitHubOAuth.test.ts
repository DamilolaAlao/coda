import { describe, expect, it } from "vite-plus/test";

import { internals } from "./GitHubOAuth.ts";

describe("GitHub OAuth state", () => {
  it("reads the named cookie without accepting similarly named cookies", () => {
    expect(
      internals.cookieValue("other=one; oauth_state=expected; oauth_state_old=two", "oauth_state"),
    ).toBe("expected");
    expect(internals.cookieValue("oauth_state_old=two", "oauth_state")).toBeNull();
  });

  it("decodes encoded cookie values", () => {
    expect(internals.cookieValue("oauth_state=value%2Bwith%2Fsymbols", "oauth_state")).toBe(
      "value+with/symbols",
    );
  });

  it("requires an exact non-empty state match", () => {
    expect(internals.stateMatches("expected", "expected")).toBe(true);
    expect(internals.stateMatches("expected", "different")).toBe(false);
    expect(internals.stateMatches("expected", null)).toBe(false);
    expect(internals.stateMatches(null, "expected")).toBe(false);
  });
});
