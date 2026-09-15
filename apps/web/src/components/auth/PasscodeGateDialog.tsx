import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback, useState } from "react";

import { connectPairing } from "../../connection/onboarding";
import { resolvePasscodePairingHost } from "../../passcodeGate";
import { useAtomCommand } from "../../state/use-atom-command";
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

export function PasscodeGateDialog({ open }: { readonly open: boolean }) {
  const connectPairingEnvironment = useAtomCommand(connectPairing, {
    reportFailure: false,
  });
  const [passcode, setPasscode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitPasscode = useCallback(async () => {
    const credential = passcode.trim();
    if (!credential) {
      setErrorMessage("Enter a passcode to continue.");
      return;
    }

    const host = resolvePasscodePairingHost(credential);
    if (!host) {
      setErrorMessage("This passcode is missing a backend host.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    const result = await connectPairingEnvironment({
      host,
      pairingCode: credential,
    });
    setIsSubmitting(false);

    if (result._tag === "Failure") {
      setErrorMessage(errorMessageFromUnknown(squashAtomCommandFailure(result)));
    }
  }, [connectPairingEnvironment, passcode]);

  return (
    <AlertDialog open={open}>
      <AlertDialogPopup className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Authentication required</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the pairing passcode from the Coda server to unlock this browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="space-y-3 px-6 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPasscode();
          }}
        >
          <label className="text-sm font-medium" htmlFor="coda-passcode">
            Passcode
          </label>
          <Input
            id="coda-passcode"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            autoFocus
            disabled={isSubmitting}
            nativeInput
            onChange={(event) => setPasscode(event.currentTarget.value)}
            placeholder="Paste the JWT passcode"
            spellCheck={false}
            type="password"
            value={passcode}
          />
          {errorMessage ? (
            <p className="text-sm text-destructive whitespace-pre-wrap">{errorMessage}</p>
          ) : null}
        </form>
        <AlertDialogFooter>
          <Button disabled={isSubmitting} onClick={() => void submitPasscode()}>
            {isSubmitting ? "Checking..." : "Continue"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Authentication failed.";
}
