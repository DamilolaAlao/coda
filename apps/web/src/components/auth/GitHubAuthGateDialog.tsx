import { APP_DISPLAY_NAME } from "../../branding";
import { GitHubIcon } from "../Icons";
import { Button } from "../ui/button";

export function GitHubAuthGateDialog({
  open,
  isConnecting,
  isChecking,
  environmentReady,
  errorMessage,
  onConnect,
}: {
  readonly open: boolean;
  readonly isConnecting: boolean;
  readonly isChecking?: boolean;
  readonly environmentReady: boolean;
  readonly errorMessage: string;
  readonly onConnect: () => void;
}) {
  if (!open) return null;

  const checking = isChecking === true;
  const busy = isConnecting || checking || !environmentReady;
  const actionLabel = isConnecting
    ? "Connecting…"
    : checking
      ? "Checking GitHub…"
      : environmentReady
        ? "Continue with GitHub"
        : "Preparing environment…";
  const description = checking
    ? "Checking whether this browser already has a GitHub account connected."
    : "Sign in with GitHub to load your projects. The same GitHub account on every device shares that data.";

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Sign in with GitHub
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

        {errorMessage ? (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive whitespace-pre-wrap">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={onConnect}>
            <GitHubIcon className="size-4" />
            {actionLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
