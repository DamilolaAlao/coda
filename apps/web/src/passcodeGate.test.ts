import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_HOSTED_PASSCODE,
  evaluateHostedPasscodeAttempt,
  emptyPasscodeAttemptState,
  HOSTED_PASSCODE_LOCKOUT_MS,
  HOSTED_PASSCODE_MAX_ATTEMPTS,
  readPasscodeAttemptState,
  readPasscodeUnlocked,
  writePasscodeAttemptState,
  writePasscodeUnlocked,
} from "./passcodeGate";

describe("hosted passcode gate", () => {
  it("accepts the hardcoded 6-digit passcode", () => {
    expect(
      evaluateHostedPasscodeAttempt({
        passcode: DEFAULT_HOSTED_PASSCODE,
        expected: DEFAULT_HOSTED_PASSCODE,
        now: 1_000,
        state: emptyPasscodeAttemptState(),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects JWT-shaped values as the wrong format", () => {
    expect(
      evaluateHostedPasscodeAttempt({
        passcode: "eyJhbGciOiJIUzI1NiJ9.e30.signature",
        expected: DEFAULT_HOSTED_PASSCODE,
        now: 1_000,
        state: emptyPasscodeAttemptState(),
      }),
    ).toMatchObject({ ok: false, kind: "invalid_format" });
  });

  it("counts incorrect 6-digit trials and locks after the limit", () => {
    let state = emptyPasscodeAttemptState();
    for (let attempt = 1; attempt < HOSTED_PASSCODE_MAX_ATTEMPTS; attempt += 1) {
      const result = evaluateHostedPasscodeAttempt({
        passcode: "000000",
        expected: DEFAULT_HOSTED_PASSCODE,
        now: 1_000,
        state,
      });
      expect(result.ok).toBe(false);
      if (result.ok || result.kind !== "mismatch") {
        throw new Error("expected a mismatch");
      }
      expect(result.remainingAttempts).toBe(HOSTED_PASSCODE_MAX_ATTEMPTS - attempt);
      state = result.next;
    }

    const locked = evaluateHostedPasscodeAttempt({
      passcode: "000000",
      expected: DEFAULT_HOSTED_PASSCODE,
      now: 5_000,
      state,
    });
    expect(locked).toMatchObject({
      ok: false,
      kind: "locked",
      remainingMs: HOSTED_PASSCODE_LOCKOUT_MS,
    });
    if (locked.ok || locked.kind !== "locked") {
      throw new Error("expected lockout");
    }

    const stillLocked = evaluateHostedPasscodeAttempt({
      passcode: DEFAULT_HOSTED_PASSCODE,
      expected: DEFAULT_HOSTED_PASSCODE,
      now: 5_000 + HOSTED_PASSCODE_LOCKOUT_MS - 1,
      state: locked.next,
    });
    expect(stillLocked.ok).toBe(false);
    if (stillLocked.ok || stillLocked.kind !== "locked") {
      throw new Error("expected lockout to still apply");
    }

    expect(
      evaluateHostedPasscodeAttempt({
        passcode: DEFAULT_HOSTED_PASSCODE,
        expected: DEFAULT_HOSTED_PASSCODE,
        now: 5_000 + HOSTED_PASSCODE_LOCKOUT_MS,
        state: locked.next,
      }),
    ).toEqual({ ok: true });
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
});
