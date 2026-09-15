/**
 * REST client right-panel surface: named requests, headers, body, and a
 * response pane. Sends go through the connected environment so local and
 * remote APIs work without browser CORS.
 */
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { fetchEnvironmentHttpClientSend } from "@t3tools/client-runtime/state/http-client";
import type { EnvironmentId, HttpClientMethod, HttpClientSendResult } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Plus, Send, Trash2, Unplug } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { runtime } from "~/lib/runtime";
import { usePreparedConnection } from "~/state/session";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import {
  type HttpClientAuth,
  type HttpClientDraft,
  type HttpClientFieldRow,
  buildHttpClientSendInput,
  formatHttpClientBody,
  newFieldRow,
  newHttpClientDraft,
  queryRowsFromUrl,
} from "../httpClient/buildRequest";
import {
  loadHttpClientCollection,
  saveHttpClientCollection,
  type HttpClientCollection,
} from "../httpClient/collection";

const METHODS: ReadonlyArray<HttpClientMethod> = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

type EditorTab = "params" | "headers" | "body" | "auth";

function methodTone(method: HttpClientMethod): string {
  switch (method) {
    case "GET":
      return "text-emerald-600 dark:text-emerald-400";
    case "POST":
      return "text-sky-600 dark:text-sky-400";
    case "PUT":
    case "PATCH":
      return "text-amber-600 dark:text-amber-400";
    case "DELETE":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status >= 400) return "text-red-600 dark:text-red-400";
  if (status >= 300) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function FieldTable(props: {
  rows: HttpClientFieldRow[];
  namePlaceholder: string;
  onChange: (rows: HttpClientFieldRow[]) => void;
}) {
  const update = (id: string, patch: Partial<HttpClientFieldRow>) => {
    props.onChange(props.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {props.rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={row.enabled}
            aria-label={`Include ${props.namePlaceholder.toLowerCase()} ${row.name || "row"}`}
            className="size-3.5 accent-foreground"
            onChange={(event) => update(row.id, { enabled: event.target.checked })}
          />
          <Input
            size="compact"
            placeholder={props.namePlaceholder}
            value={row.name}
            onChange={(event) => update(row.id, { name: event.target.value })}
          />
          <Input
            size="compact"
            placeholder="Value"
            value={row.value}
            onChange={(event) => update(row.id, { value: event.target.value })}
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Remove row"
            className="text-muted-foreground"
            onClick={() => {
              const next = props.rows.filter((candidate) => candidate.id !== row.id);
              props.onChange(next.length > 0 ? next : [newFieldRow()]);
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="self-start text-muted-foreground"
        onClick={() => props.onChange([...props.rows, newFieldRow()])}
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
}

export function RestClientPanel(props: { environmentId: EnvironmentId | null }) {
  const preparedConnection = usePreparedConnection(props.environmentId);
  const [collection, setCollection] = useState<HttpClientCollection>(() =>
    props.environmentId ? loadHttpClientCollection(props.environmentId) : { activeId: "", requests: [] },
  );
  const [editorTab, setEditorTab] = useState<EditorTab>("params");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpClientSendResult | null>(null);

  useEffect(() => {
    if (!props.environmentId) return;
    setCollection(loadHttpClientCollection(props.environmentId));
    setResponse(null);
    setError(null);
  }, [props.environmentId]);

  useEffect(() => {
    if (!props.environmentId || collection.requests.length === 0) return;
    saveHttpClientCollection(props.environmentId, collection);
  }, [collection, props.environmentId]);

  const draft = useMemo(
    () => collection.requests.find((request) => request.id === collection.activeId) ?? null,
    [collection],
  );

  const updateDraft = useCallback((patch: Partial<HttpClientDraft>) => {
    setCollection((current) => ({
      ...current,
      requests: current.requests.map((request) =>
        request.id === current.activeId ? { ...request, ...patch } : request,
      ),
    }));
  }, []);

  const send = useCallback(async () => {
    if (!draft) return;
    if (Option.isNone(preparedConnection)) {
      setError("Connect this environment before sending.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const signer = yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner);
          return yield* fetchEnvironmentHttpClientSend({
            prepared: preparedConnection.value,
            request: buildHttpClientSendInput(draft),
            signer,
          });
        }),
      );
      setResponse(result);
    } catch (cause) {
      setResponse(null);
      setError(
        cause instanceof Error && cause.message.length > 0 ? cause.message : "The request failed.",
      );
    } finally {
      setSending(false);
    }
  }, [draft, preparedConnection]);

  if (!props.environmentId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
        Open a thread to send HTTP from that environment.
      </div>
    );
  }

  if (!draft) {
    return null;
  }

  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: "params", label: "Query" },
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-44 shrink-0 flex-col border-r border-border/80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
            <Unplug className="size-3" />
            Requests
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="New request"
            onClick={() => {
              const request = newHttpClientDraft();
              setCollection((current) => ({
                activeId: request.id,
                requests: [...current.requests, request],
              }));
              setResponse(null);
              setError(null);
            }}
          >
            <Plus className="size-3" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-1">
            {collection.requests.map((request) => (
              <button
                key={request.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs",
                  request.id === collection.activeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                onClick={() => {
                  setCollection((current) => ({ ...current, activeId: request.id }));
                  setResponse(null);
                  setError(null);
                }}
              >
                <span className={cn("w-10 shrink-0 font-semibold", methodTone(request.method))}>
                  {request.method}
                </span>
                <span className="truncate">{request.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-2 border-b border-border/80 p-2">
          <Input
            size="compact"
            value={draft.name}
            aria-label="Request name"
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
          <div className="flex items-center gap-1.5">
            <Select
              value={draft.method}
              onValueChange={(value) => {
                if (typeof value === "string") updateDraft({ method: value as HttpClientMethod });
              }}
            >
              <SelectTrigger size="compact" className="w-[6.5rem] shrink-0" aria-label="HTTP method">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <Input
              size="compact"
              className="min-w-0 flex-1"
              placeholder="https://"
              aria-label="Request URL"
              value={draft.url}
              onChange={(event) => {
                const url = event.target.value;
                updateDraft({ url, query: queryRowsFromUrl(url) });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="button" size="sm" disabled={sending} onClick={() => void send()}>
              <Send className="size-3.5" />
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border/80 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "px-2 py-1.5 text-xs",
                editorTab === tab.id
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setEditorTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {editorTab === "params" ? (
            <FieldTable
              rows={draft.query}
              namePlaceholder="Param"
              onChange={(query) => updateDraft({ query })}
            />
          ) : null}
          {editorTab === "headers" ? (
            <FieldTable
              rows={draft.headers}
              namePlaceholder="Header"
              onChange={(headers) => updateDraft({ headers })}
            />
          ) : null}
          {editorTab === "body" ? (
            <div className="flex h-full min-h-32 flex-col gap-2">
              <Select
                value={draft.bodyMode}
                onValueChange={(value) => {
                  if (value === "none" || value === "json" || value === "text") {
                    updateDraft({ bodyMode: value });
                  }
                }}
              >
                <SelectTrigger size="compact" className="w-28" aria-label="Body type">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectPopup>
              </Select>
              {draft.bodyMode === "none" ? (
                <p className="text-muted-foreground text-xs">This request has no body.</p>
              ) : (
                <Textarea
                  className="min-h-32 flex-1 font-mono text-xs"
                  value={draft.body}
                  spellCheck={false}
                  onChange={(event) => updateDraft({ body: event.target.value })}
                />
              )}
            </div>
          ) : null}
          {editorTab === "auth" ? (
            <AuthEditor auth={draft.auth} onChange={(auth) => updateDraft({ auth })} />
          ) : null}
        </div>

        <div className="flex min-h-36 flex-col border-t border-border/80">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="font-medium text-muted-foreground">Response</span>
            {response ? (
              <span className={cn("tabular-nums", statusTone(response.status))}>
                {response.status} {response.statusText} · {response.durationMs}ms
                {response.truncated ? " · truncated" : ""}
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <pre className="whitespace-pre-wrap break-all px-3 pb-3 font-mono text-xs text-foreground">
              {error ??
                (response ? formatHttpClientBody(response.body) || "(empty body)" : "Send a request to see the response.")}
            </pre>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function AuthEditor(props: { auth: HttpClientAuth; onChange: (auth: HttpClientAuth) => void }) {
  const auth = props.auth;
  return (
    <div className="flex max-w-md flex-col gap-2">
      <Select
        value={auth.type}
        onValueChange={(value) => {
          if (value === "none") props.onChange({ type: "none" });
          if (value === "bearer") {
            props.onChange({
              type: "bearer",
              token: auth.type === "bearer" ? auth.token : "",
            });
          }
          if (value === "basic") {
            props.onChange({
              type: "basic",
              username: auth.type === "basic" ? auth.username : "",
              password: auth.type === "basic" ? auth.password : "",
            });
          }
        }}
      >
        <SelectTrigger size="compact" className="w-36" aria-label="Auth type">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="bearer">Bearer</SelectItem>
          <SelectItem value="basic">Basic</SelectItem>
        </SelectPopup>
      </Select>
      {auth.type === "bearer" ? (
        <Input
          size="compact"
          type="password"
          placeholder="Token"
          aria-label="Bearer token"
          value={auth.token}
          onChange={(event) => props.onChange({ type: "bearer", token: event.target.value })}
        />
      ) : null}
      {auth.type === "basic" ? (
        <BasicAuthFields
          username={auth.username}
          password={auth.password}
          onChange={props.onChange}
        />
      ) : null}
    </div>
  );
}

function BasicAuthFields(props: {
  username: string;
  password: string;
  onChange: (auth: HttpClientAuth) => void;
}) {
  return (
    <>
      <Input
        size="compact"
        placeholder="Username"
        aria-label="Basic username"
        value={props.username}
        onChange={(event) =>
          props.onChange({ type: "basic", username: event.target.value, password: props.password })
        }
      />
      <Input
        size="compact"
        type="password"
        placeholder="Password"
        aria-label="Basic password"
        value={props.password}
        onChange={(event) =>
          props.onChange({ type: "basic", username: props.username, password: event.target.value })
        }
      />
    </>
  );
}
