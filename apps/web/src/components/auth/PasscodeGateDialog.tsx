import { useCallback, useEffect, useState } from "react";

import {
  configuredHostedPasscode,
  emptyPasscodeAttemptState,
  evaluateHostedPasscodeAttempt,
  formatLockoutMessage,
  HOSTED_PASSCODE_LENGTH,
  readPasscodeAttemptState,
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
  onUnlocked,
}: {
  readonly open: boolean;
  readonly onUnlocked: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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

  const submitPasscode = useCallback(() => {
    const result = evaluateHostedPasscodeAttempt({
      passcode,
      expected: configuredHostedPasscode(),
      now: Date.now(),
      state: attemptState,
    });

    if (result.ok) {
      writePasscodeAttemptState(emptyPasscodeAttemptState());
      setAttemptState(emptyPasscodeAttemptState());
      setErrorMessage("");
      setPasscode("");
      onUnlocked();
      return;
    }

    if (result.kind === "invalid_format") {
      setErrorMessage(result.message);
      return;
    }

    writePasscodeAttemptState(result.next);
    setAttemptState(result.next);
    setErrorMessage(
      result.kind === "locked" ? formatLockoutMessage(result.remainingMs) : result.message,
    );
  }, [attemptState, onUnlocked, passcode]);

  return (
    <AlertDialog open={open}>
      <AlertDialogPopup className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Authentication required</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the 6-digit passcode to unlock this browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="space-y-3 px-6 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked) submitPasscode();
          }}
        >
          <label className="text-sm font-medium" htmlFor="coda-passcode">
            Passcode
          </label>
          <Input
            id="coda-passcode"
            autoComplete="one-time-code"
            autoFocus
            disabled={locked}
            inputMode="numeric"
            maxLength={HOSTED_PASSCODE_LENGTH}
            nativeInput
            onChange={(event) =>
              setPasscode(event.currentTarget.value.replace(/\D/g, "").slice(0, HOSTED_PASSCODE_LENGTH))
            }
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
          <Button disabled={locked} onClick={() => submitPasscode()}>
            Continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
