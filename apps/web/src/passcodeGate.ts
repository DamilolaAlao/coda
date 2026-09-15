const PASSCODE_UNLOCK_KEY = "coda:hosted-passcode-unlocked";
const PASSCODE_ATTEMPTS_KEY = "coda:hosted-passcode-attempts";

export const HOSTED_PASSCODE_LENGTH = 6;
export const HOSTED_PASSCODE_MAX_ATTEMPTS = 5;
export const HOSTED_PASSCODE_LOCKOUT_MS = 30_000;

export const HOSTED_PASSCODE_PATTERN = /^\d{6}$/;

export type HostedPasscodeAttemptState = {
  failures: number;
  lockoutUntil: number;
};

export type HostedPasscodeAttemptResult =
  | { ok: true }
  | { ok: false; kind: "invalid_format"; message: string }
  | { ok: false; kind: "mismatch"; remainingAttempts: number; message: string; next: HostedPasscodeAttemptState }
  | { ok: false; kind: "locked"; remainingMs: number; message: string; next: HostedPasscodeAttemptState };

export function emptyPasscodeAttemptState(): HostedPasscodeAttemptState {
  return { failures: 0, lockoutUntil: 0 };
}

export function formatLockoutMessage(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Too many incorrect attempts. Try again in ${seconds}s.`;
}

export function evaluatePasscodeFormat(passcode: string): HostedPasscodeAttemptResult {
  if (!HOSTED_PASSCODE_PATTERN.test(passcode.trim())) {
    return {
      ok: false,
      kind: "invalid_format",
      message: "Enter the 6-digit passcode.",
    };
  }

  return { ok: true };
}

export function evaluateHostedPasscodeLockout(input: {
  readonly now: number;
  readonly state: HostedPasscodeAttemptState;
}): Extract<HostedPasscodeAttemptResult, { ok: false; kind: "locked" }> | null {
  if (input.state.lockoutUntil <= input.now) {
    return null;
  }

  const remainingMs = input.state.lockoutUntil - input.now;
  return {
    ok: false,
    kind: "locked",
    remainingMs,
    message: formatLockoutMessage(remainingMs),
    next: input.state,
  };
}

export function recordHostedPasscodeFailure(input: {
  readonly now: number;
  readonly state: HostedPasscodeAttemptState;
}): Extract<HostedPasscodeAttemptResult, { ok: false; kind: "mismatch" | "locked" }> {
  const lockout = evaluateHostedPasscodeLockout(input);
  if (lockout) {
    return lockout;
  }

  const failures = input.state.failures + 1;
  if (failures >= HOSTED_PASSCODE_MAX_ATTEMPTS) {
    const next = { failures: 0, lockoutUntil: input.now + HOSTED_PASSCODE_LOCKOUT_MS };
    return {
      ok: false,
      kind: "locked",
      remainingMs: HOSTED_PASSCODE_LOCKOUT_MS,
      message: formatLockoutMessage(HOSTED_PASSCODE_LOCKOUT_MS),
      next,
    };
  }

  const remainingAttempts = HOSTED_PASSCODE_MAX_ATTEMPTS - failures;
  return {
    ok: false,
    kind: "mismatch",
    remainingAttempts,
    message: `Incorrect passcode. ${remainingAttempts} ${remainingAttempts === 1 ? "try" : "tries"} left.`,
    next: { failures, lockoutUntil: 0 },
  };
}

function readStorage(storage: Pick<Storage, "getItem"> | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Pick<Storage, "setItem" | "removeItem"> | null, key: string, value: string | null) {
  if (!storage) return;
  try {
    if (value === null) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, value);
  } catch {
    // Private mode can reject storage writes; the in-memory dialog state still works.
  }
}

function sessionStorageOrNull(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function localStorageOrNull(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function readPasscodeUnlocked(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = localStorageOrNull(),
  fallback: Pick<Storage, "getItem"> | null = sessionStorageOrNull(),
): boolean {
  if (readStorage(storage, PASSCODE_UNLOCK_KEY) === "1") return true;
  if (readStorage(fallback, PASSCODE_UNLOCK_KEY) === "1") {
    writeStorage(storage ?? null, PASSCODE_UNLOCK_KEY, "1");
    return true;
  }
  return false;
}

export function writePasscodeUnlocked(
  unlocked: boolean,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = localStorageOrNull() ?? sessionStorageOrNull(),
): void {
  writeStorage(storage, PASSCODE_UNLOCK_KEY, unlocked ? "1" : null);
}

export function readPasscodeAttemptState(
  storage: Pick<Storage, "getItem"> | null = sessionStorageOrNull(),
): HostedPasscodeAttemptState {
  const raw = readStorage(storage, PASSCODE_ATTEMPTS_KEY);
  if (!raw) return emptyPasscodeAttemptState();
  try {
    const parsed = JSON.parse(raw) as HostedPasscodeAttemptState;
    if (
      typeof parsed.failures !== "number" ||
      !Number.isFinite(parsed.failures) ||
      typeof parsed.lockoutUntil !== "number" ||
      !Number.isFinite(parsed.lockoutUntil)
    ) {
      return emptyPasscodeAttemptState();
    }
    return {
      failures: Math.max(0, Math.trunc(parsed.failures)),
      lockoutUntil: Math.max(0, Math.trunc(parsed.lockoutUntil)),
    };
  } catch {
    return emptyPasscodeAttemptState();
  }
}

export function writePasscodeAttemptState(
  state: HostedPasscodeAttemptState,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = sessionStorageOrNull(),
): void {
  if (state.failures === 0 && state.lockoutUntil === 0) {
    writeStorage(storage, PASSCODE_ATTEMPTS_KEY, null);
    return;
  }
  writeStorage(storage, PASSCODE_ATTEMPTS_KEY, JSON.stringify(state));
}
