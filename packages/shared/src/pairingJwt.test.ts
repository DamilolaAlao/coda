import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  isPairingJwt,
  readPairingJwtAudience,
  signPairingJwt,
} from "./pairingJwt.ts";

describe("pairingJwt", () => {
  it("rejects non-JWT passcodes", () => {
    expect(isPairingJwt("QHT8GXNDB4GX")).toBe(false);
    expect(isPairingJwt("not a token")).toBe(false);
    expect(readPairingJwtAudience("QHT8GXNDB4GX")).toBeNull();
  });

  it.effect("signs a pairing JWT and reads its audience", () =>
    Effect.gen(function* () {
      const expiresAt = DateTime.add(yield* DateTime.now, { minutes: 5 });
      const token = yield* signPairingJwt({
        secret: new Uint8Array(32).fill(7),
        jti: "pair-1",
        subject: "one-time-token",
        expiresAt,
        audience: "https://app-3069-3773.prg1.zerops.app",
      });

      expect(isPairingJwt(token)).toBe(true);
      expect(readPairingJwtAudience(token)).toBe("https://app-3069-3773.prg1.zerops.app");
    }),
  );
});
