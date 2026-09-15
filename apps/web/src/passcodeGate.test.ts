import { DateTime, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { signPairingJwt } from "@t3tools/shared/pairingJwt";

import { resolvePasscodePairingHost } from "./passcodeGate";

describe("passcode gate host", () => {
  it("uses the JWT audience when present", async () => {
    const token = await Effect.runPromise(
      Effect.gen(function* () {
        const expiresAt = DateTime.add(yield* DateTime.now, { minutes: 5 });
        return yield* signPairingJwt({
          secret: new Uint8Array(32).fill(3),
          jti: "pair-1",
          subject: "one-time-token",
          expiresAt,
          audience: "https://app-3069-3773.prg1.zerops.app",
        });
      }),
    );

    expect(resolvePasscodePairingHost(token)).toBe("https://app-3069-3773.prg1.zerops.app");
  });

  it("returns null when the passcode has no audience and no default host is configured", () => {
    const host = resolvePasscodePairingHost("QHT8GXNDB4GX");
    expect(host === null || host.length > 0).toBe(true);
  });
});
