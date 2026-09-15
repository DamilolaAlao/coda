import { useAtomValue } from "@effect/atom-react";
import { groupBackgroundApps } from "@t3tools/client-runtime/state/background-apps";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  BackgroundAppLogEvent,
  BackgroundAppSnapshot,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { ExternalLink, RefreshCw, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { backgroundAppEnvironment } from "~/state/backgroundApps";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

function statusTone(status: BackgroundAppSnapshot["status"]): string {
  if (status === "running") return "bg-emerald-500";
  if (status === "failed") return "bg-destructive";
  if (status === "starting" || status === "stopping") return "bg-amber-500";
  return "bg-muted-foreground/50";
}

function appendLogEvent(current: string, event: BackgroundAppLogEvent): string {
  const next = event._tag === "status" ? `\n[${event.status}]\n` : event.data;
  return `${current}${next}`.slice(-100_000);
}

function capabilityHint(app: BackgroundAppSnapshot): string | null {
  if (app.source === "discovered" && !app.capabilities.canRestart) {
    return "Restart is unavailable because Coda did not launch this process.";
  }
  if (!app.capabilities.canReadLogs) {
    return "Logs are unavailable for this process.";
  }
  if (!app.capabilities.canStop) {
    return "Stop is unavailable because this process is not owned by a Coda terminal.";
  }
  return null;
}

function AppLogs(props: { environmentId: ScopedThreadRef["environmentId"]; appId: string }) {
  const logsAtom = useMemo(
    () =>
      backgroundAppEnvironment.logs({
        environmentId: props.environmentId,
        input: { appId: props.appId },
      }),
    [props.appId, props.environmentId],
  );
  const event = useAtomValue(logsAtom);
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [props.appId]);
  useEffect(() => {
    if (event._tag !== "Success") return;
    setText((current) => appendLogEvent(current, event.value));
  }, [event]);

  return (
    <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
      {text || "Waiting for output…"}
    </pre>
  );
}

function AppCard(props: {
  app: BackgroundAppSnapshot;
  environmentId: ScopedThreadRef["environmentId"];
  expanded: boolean;
  onToggleLogs: () => void;
  onOpenPreview: (url: string) => void;
  onRestart: () => void;
  onStop: () => void;
}) {
  const { app } = props;
  const previewUrl = app.previewUrl ?? app.endpoints[0]?.url ?? null;
  const hint = capabilityHint(app);
  const uptime = app.startedAt ? formatRelativeTimeLabel(app.startedAt) : null;

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", statusTone(app.status))} />
            <h3 className="truncate font-medium text-sm">{app.label}</h3>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {app.command ?? app.cwd}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {app.source === "managed" ? "Managed" : "Discovered"}
            {uptime ? ` · started ${uptime}` : ""}
            {app.endpoints.length > 0
              ? ` · ${app.endpoints.length} ${app.endpoints.length === 1 ? "port" : "ports"}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 capitalize text-[11px] text-muted-foreground">{app.status}</span>
      </div>
      {app.endpoints.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {app.endpoints.map((endpoint) => (
            <span
              key={`${endpoint.host}:${endpoint.port}`}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
            >
              :{endpoint.port}
            </span>
          ))}
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {app.capabilities.canOpen && previewUrl ? (
          <Button size="xs" variant="outline" onClick={() => props.onOpenPreview(previewUrl)}>
            <ExternalLink className="size-3" />
            Open Preview
          </Button>
        ) : null}
        {app.capabilities.canRestart ? (
          <Button size="xs" variant="outline" onClick={props.onRestart}>
            <RotateCcw className="size-3" />
            Restart
          </Button>
        ) : null}
        {app.capabilities.canStop ? (
          <Button size="xs" variant="outline" onClick={props.onStop}>
            <Square className="size-3" />
            Stop
          </Button>
        ) : null}
        {app.capabilities.canReadLogs ? (
          <Button size="xs" variant="ghost" onClick={props.onToggleLogs}>
            {props.expanded ? "Hide logs" : "Logs"}
          </Button>
        ) : null}
      </div>
      {props.expanded ? (
        <div className="mt-3">
          <AppLogs environmentId={props.environmentId} appId={app.id} />
        </div>
      ) : null}
    </section>
  );
}

export function BackgroundAppsPanel(props: {
  threadRef: ScopedThreadRef;
  onOpenPreview: (url: string) => void;
}) {
  const listAtom = useMemo(
    () =>
      backgroundAppEnvironment.list({
        environmentId: props.threadRef.environmentId,
        input: { threadId: props.threadRef.threadId },
      }),
    [props.threadRef.environmentId, props.threadRef.threadId],
  );
  const eventAtom = useMemo(
    () =>
      backgroundAppEnvironment.events({
        environmentId: props.threadRef.environmentId,
        input: {},
      }),
    [props.threadRef.environmentId],
  );
  const list = useEnvironmentQuery(listAtom);
  const latestEvent = useAtomValue(eventAtom);
  const stop = useAtomCommand(backgroundAppEnvironment.stop, { reportFailure: false });
  const restart = useAtomCommand(backgroundAppEnvironment.restart, { reportFailure: false });
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (
      latestEvent._tag === "Success" &&
      latestEvent.value.snapshot.threadId === props.threadRef.threadId
    ) {
      list.refresh();
    }
  }, [latestEvent, list.refresh, props.threadRef.threadId]);

  const runAction = async (kind: "stop" | "restart", appId: string) => {
    setActionError(null);
    const command = kind === "stop" ? stop : restart;
    const result = await command({
      environmentId: props.threadRef.environmentId,
      input: { appId },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      setActionError(error instanceof Error ? error.message : `Failed to ${kind} app.`);
    }
    list.refresh();
  };

  const apps = list.data?.apps ?? [];
  const grouped = groupBackgroundApps(apps);

  const renderCard = (app: BackgroundAppSnapshot) => (
    <AppCard
      key={app.id}
      app={app}
      environmentId={props.threadRef.environmentId}
      expanded={expandedAppId === app.id}
      onToggleLogs={() => setExpandedAppId(expandedAppId === app.id ? null : app.id)}
      onOpenPreview={props.onOpenPreview}
      onRestart={() => void runAction("restart", app.id)}
      onStop={() => void runAction("stop", app.id)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 className="font-medium text-sm">Apps</h2>
          <p className="text-[11px] text-muted-foreground">
            {apps.length} {apps.length === 1 ? "app" : "apps"} in this thread
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Refresh apps" onClick={list.refresh}>
          <RefreshCw className={cn("size-3.5", list.isPending && "animate-spin")} />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {list.error ? <p className="text-sm text-destructive">{list.error}</p> : null}
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          {!list.isPending && apps.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm">No background apps</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run an action configured to run in the background.
              </p>
            </div>
          ) : null}
          {grouped.active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
                Running
              </h3>
              {grouped.active.map(renderCard)}
            </div>
          ) : null}
          {grouped.idle.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
                Stopped
              </h3>
              {grouped.idle.map(renderCard)}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
