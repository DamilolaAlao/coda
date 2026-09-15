import { decodeJwt, SignJWT, type JWTPayload } from "jose";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const PAIRING_JWT_TYP = "coda-pair+jwt";

const PAIRING_JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

export class PairingJwtError extends Schema.TaggedErrorClass<PairingJwtError>()("PairingJwtError", {
  operation: Schema.Literals(["sign"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Failed to sign pairing JWT.";
  }
}

export function isPairingJwt(value: string): boolean {
  return PAIRING_JWT_SHAPE.test(value.trim());
}

export function readPairingJwtAudience(token: string): string | null {
  if (!isPairingJwt(token)) {
    return null;
  }

  let payload: JWTPayload;
  try {
    payload = decodeJwt(token.trim());
  } catch {
    return null;
  }

  if (typeof payload.aud === "string" && payload.aud.trim().length > 0) {
    return payload.aud.trim();
  }

  if (Array.isArray(payload.aud)) {
    const audience = payload.aud.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return audience?.trim() ?? null;
  }

  return null;
}

export function signPairingJwt(input: {
  readonly secret: Uint8Array;
  readonly jti: string;
  readonly subject: string;
  readonly expiresAt: DateTime.Utc;
  readonly audience?: string;
}): Effect.Effect<string, PairingJwtError> {
  return Effect.tryPromise({
    try: async () => {
      let token = new SignJWT({ sub: input.subject })
        .setProtectedHeader({ alg: "HS256", typ: PAIRING_JWT_TYP })
        .setJti(input.jti)
        .setIssuedAt()
        .setExpirationTime(DateTime.toDate(input.expiresAt));

      const audience = input.audience?.trim();
      if (audience) {
        token = token.setAudience(audience);
      }

      return token.sign(input.secret);
    },
    catch: (cause) => new PairingJwtError({ operation: "sign", cause }),
  });
}
