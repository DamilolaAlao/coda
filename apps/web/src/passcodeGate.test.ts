import { describe, expect, it } from "vite-plus/test";

import {
  emptyPasscodeAttemptState,
  evaluatePasscodeFormat,
  evaluateHostedPasscodeLockout,
  HOSTED_PASSCODE_LOCKOUT_MS,
  HOSTED_PASSCODE_MAX_ATTEMPTS,
  readPasscodeAttemptState,
  readPasscodeUnlocked,
  recordHostedPasscodeFailure,
  writePasscodeAttemptState,
  writePasscodeUnlocked,
} from "./passcodeGate";

describe("hosted passcode gate", () => {
  it("accepts only a 6-digit passcode format", () => {
    expect(evaluatePasscodeFormat("123456")).toEqual({ ok: true });
    expect(evaluatePasscodeFormat(" 111222 ")).toEqual({ ok: true });
    expect(evaluatePasscodeFormat("abc123")).toMatchObject({ ok: false, kind: "invalid_format" });
    expect(evaluatePasscodeFormat("eyJhbGciOiJIUzI1NiJ9.e30.signature")).toMatchObject({
      ok: false,
      kind: "invalid_format",
    });
  });

  it("counts incorrect trials locally and locks after the limit", () => {
    let state = emptyPasscodeAttemptState();
    for (let attempt = 1; attempt < HOSTED_PASSCODE_MAX_ATTEMPTS; attempt += 1) {
      const result = recordHostedPasscodeFailure({ now: 1_000, state });
      expect(result.kind).toBe("mismatch");
      if (result.kind !== "mismatch") {
        throw new Error("expected a mismatch");
      }
      expect(result.remainingAttempts).toBe(HOSTED_PASSCODE_MAX_ATTEMPTS - attempt);
      state = result.next;
    }

    const locked = recordHostedPasscodeFailure({ now: 5_000, state });
    expect(locked).toMatchObject({
      ok: false,
      kind: "locked",
      remainingMs: HOSTED_PASSCODE_LOCKOUT_MS,
    });
    if (locked.kind !== "locked") {
      throw new Error("expected lockout");
    }

    expect(
      evaluateHostedPasscodeLockout({
        now: 5_000 + HOSTED_PASSCODE_LOCKOUT_MS - 1,
        state: locked.next,
      }),
    ).toMatchObject({ ok: false, kind: "locked" });

    expect(
      evaluateHostedPasscodeLockout({
        now: 5_000 + HOSTED_PASSCODE_LOCKOUT_MS,
        state: locked.next,
      }),
    ).toBeNull();
  });

  it("round-trips unlock and attempt state through storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };

    expect(readPasscodeUnlocked(adapter)).toBe(false);
    writePasscodeUnlocked(true, adapter);
    expect(readPasscodeUnlocked(adapter)).toBe(true);

    writePasscodeAttemptState({ failures: 2, lockoutUntil: 9_000 }, adapter);
    expect(readPasscodeAttemptState(adapter)).toEqual({ failures: 2, lockoutUntil: 9_000 });
  });

  it("migrates a session unlock onto durable storage", () => {
    const local = new Map<string, string>();
    const session = new Map<string, string>([["coda:hosted-passcode-unlocked", "1"]]);
    const localAdapter = {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => {
        local.set(key, value);
      },
      removeItem: (key: string) => {
        local.delete(key);
      },
    };
    const sessionAdapter = {
      getItem: (key: string) => session.get(key) ?? null,
    };

    expect(readPasscodeUnlocked(localAdapter, sessionAdapter)).toBe(true);
    expect(local.get("coda:hosted-passcode-unlocked")).toBe("1");
  });
});
