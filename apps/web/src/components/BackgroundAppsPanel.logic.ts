import { DISCOVERED_LISTENER_TERMINAL_ID, type BackgroundAppEvent } from "@t3tools/contracts";

export function shouldRefreshBackgroundAppsFromEvent(
  event: { readonly _tag: string; readonly value?: BackgroundAppEvent },
  threadId: string,
): boolean {
  if (event._tag !== "Success" || event.value == null) {
    return false;
  }
  const { snapshot } = event.value;
  return (
    snapshot.threadId === threadId || snapshot.terminalId === DISCOVERED_LISTENER_TERMINAL_ID
  );
}

export function backgroundAppsHeaderSummary(input: {
  readonly pending: boolean;
  readonly appCount: number;
}): string {
  if (input.pending && input.appCount === 0) {
    return "Loading…";
  }
  return `${input.appCount} ${input.appCount === 1 ? "app" : "apps"} in this thread`;
}

export function backgroundAppLogPlaceholder(input: {
  readonly connected: boolean;
  readonly hasOutput: boolean;
}): string {
  if (input.hasOutput) {
    return "";
  }
  return input.connected ? "Waiting for output…" : "Connecting to logs…";
}
