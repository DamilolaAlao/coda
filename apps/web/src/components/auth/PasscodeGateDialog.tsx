import { useCallback, useEffect, useState } from "react";

import {
  emptyPasscodeAttemptState,
  evaluateHostedPasscodeLockout,
  evaluatePasscodeFormat,
  formatLockoutMessage,
  HOSTED_PASSCODE_LENGTH,
  readPasscodeAttemptState,
  recordHostedPasscodeFailure,
  writePasscodeAttemptState,
} from "../../passcodeGate";
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PasscodeGateDialog({
  open,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onSubmit: (passcode: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptState, setAttemptState] = useState(emptyPasscodeAttemptState);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(0);

  useEffect(() => {
    if (!open) return;
    setAttemptState(readPasscodeAttemptState());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const remaining = Math.max(0, attemptState.lockoutUntil - Date.now());
      setLockoutRemainingMs(remaining);
    };
    tick();
    if (attemptState.lockoutUntil <= Date.now()) return;
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [attemptState.lockoutUntil, open]);

  const locked = lockoutRemainingMs > 0;

  const submitPasscode = useCallback(
    async (rawPasscode = passcode) => {
      const format = evaluatePasscodeFormat(rawPasscode);
      if (!format.ok) {
        setErrorMessage(format.message);
        return;
      }

      const lockout = evaluateHostedPasscodeLockout({
        now: Date.now(),
        state: attemptState,
      });
      if (lockout) {
        writePasscodeAttemptState(lockout.next);
        setAttemptState(lockout.next);
        setErrorMessage(formatLockoutMessage(lockout.remainingMs));
        return;
      }

      setIsSubmitting(true);
      setErrorMessage("");
      try {
        await onSubmit(rawPasscode.trim());
        writePasscodeAttemptState(emptyPasscodeAttemptState());
        setAttemptState(emptyPasscodeAttemptState());
        setPasscode("");
      } catch (error) {
        const failure = recordHostedPasscodeFailure({
          now: Date.now(),
          state: attemptState,
        });
        writePasscodeAttemptState(failure.next);
        setAttemptState(failure.next);
        const backendMessage =
          error instanceof Error
            ? error.message.trim()
            : typeof error === "string"
              ? error.trim()
              : "";
        setErrorMessage(
          failure.kind === "locked"
            ? formatLockoutMessage(failure.remainingMs)
            : backendMessage || failure.message,
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [attemptState, onSubmit, passcode],
  );

  return (
    <AlertDialog open={open}>
      <AlertDialogPopup className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Authentication required</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the 6-digit passcode. This browser will pair with your environment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="space-y-3 px-6 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked && !isSubmitting) void submitPasscode();
          }}
        >
          <label className="text-sm font-medium" htmlFor="coda-passcode">
            Passcode
          </label>
          <Input
            id="coda-passcode"
            autoComplete="one-time-code"
            autoFocus
            disabled={locked || isSubmitting}
            inputMode="numeric"
            maxLength={HOSTED_PASSCODE_LENGTH}
            nativeInput
            onChange={(event) => {
              const next = event.currentTarget.value.replace(/\D/g, "").slice(0, HOSTED_PASSCODE_LENGTH);
              setPasscode(next);
              if (!locked && !isSubmitting && next.length === HOSTED_PASSCODE_LENGTH) {
                void submitPasscode(next);
              }
            }}
            pattern="\d{6}"
            placeholder="6-digit passcode"
            spellCheck={false}
            type="password"
            value={passcode}
          />
          {errorMessage ? (
            <p className="text-sm text-destructive whitespace-pre-wrap">
              {locked ? formatLockoutMessage(lockoutRemainingMs) : errorMessage}
            </p>
          ) : locked ? (
            <p className="text-sm text-destructive whitespace-pre-wrap">
              {formatLockoutMessage(lockoutRemainingMs)}
            </p>
          ) : null}
        </form>
        <AlertDialogFooter>
          <Button disabled={locked || isSubmitting} onClick={() => void submitPasscode()}>
            {isSubmitting ? "Pairing..." : "Continue"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
