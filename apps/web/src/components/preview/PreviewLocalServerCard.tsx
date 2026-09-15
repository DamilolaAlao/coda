import type { BackgroundAppSnapshot, ScopedThreadRef } from "@t3tools/contracts";
import { RotateCcw, Square } from "lucide-react";

import { PreviewFaviconIcon } from "./PreviewFaviconIcon";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

interface Props {
  threadRef: ScopedThreadRef;
  server: PreviewableServer;
  app?: BackgroundAppSnapshot | null;
  onOpen: () => void;
  onRestart?: () => void;
  onStop?: () => void;
}

export function PreviewLocalServerCard({
  threadRef,
  server,
  app,
  onOpen,
  onRestart,
  onStop,
}: Props) {
  const subtitle = describeServer(server, app);
  const canRestart = Boolean(app?.capabilities.canRestart && onRestart);
  const canStop = Boolean(app?.capabilities.canStop && onStop);
  return (
    <div className="flex w-full items-center gap-2 pr-2">
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <PreviewFaviconIcon threadRef={threadRef} url={server.requestedUrl} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{subtitle}</span>
          <span className="truncate text-xs text-muted-foreground">
            {server.host}:{server.port}
            {app ? ` · ${app.source === "managed" ? "Managed app" : "Discovered"}` : ""}
          </span>
        </div>
      </button>
      {canRestart || canStop ? (
        <div className="flex shrink-0 gap-1">
          {canRestart ? (
            <button
              type="button"
              aria-label={`Restart ${subtitle}`}
              onClick={onRestart}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : null}
          {canStop ? (
            <button
              type="button"
              aria-label={`Stop ${subtitle}`}
              onClick={onStop}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Square className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function describeServer(server: PreviewableServer, app?: BackgroundAppSnapshot | null): string {
  if (app?.label) return app.label;
  if (server.processName) return server.processName;
  return "Listening";
}
