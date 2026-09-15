import {
  HTTP_CLIENT_MAX_RESPONSE_CHARS,
  type HttpClientHeaderPair,
  type HttpClientMethod,
  type HttpClientSendInput,
  type HttpClientSendResult,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { hasBody } from "effect/unstable/http/HttpMethod";

import { parseHttpClientTargetUrl } from "./targetUrl.ts";

const BLOCKED_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export type HttpClientSendFailure = "invalid_http_target" | "http_client_send_failed";

export function sanitizeHttpClientHeaders(
  headers: ReadonlyArray<HttpClientHeaderPair>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const header of headers) {
    const name = header.name.trim();
    if (!HEADER_NAME.test(name) || BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    next[name] = header.value;
  }
  return next;
}

export const sendHttpClientRequest = Effect.fn("environment.httpClient.send")(function* (
  input: HttpClientSendInput,
) {
  const target = parseHttpClientTargetUrl(input.url);
  if (target === null) {
    return yield* Effect.fail("invalid_http_target" as const satisfies HttpClientSendFailure);
  }

  const method: HttpClientMethod = input.method;
  let request = HttpClientRequest.make(method)(target.href, {
    headers: sanitizeHttpClientHeaders(input.headers),
  });
  if (input.body !== undefined && hasBody(method)) {
    request = HttpClientRequest.bodyText(request, input.body);
  }

  const httpClient = yield* HttpClient.HttpClient;
  const startedAt = yield* Clock.currentTimeMillis;
  const response = yield* httpClient.execute(request).pipe(
    Effect.timeout(Duration.seconds(60)),
    Effect.mapError((): HttpClientSendFailure => "http_client_send_failed"),
  );
  const rawBody = yield* response.text.pipe(
    Effect.mapError((): HttpClientSendFailure => "http_client_send_failed"),
  );
  const truncated = rawBody.length > HTTP_CLIENT_MAX_RESPONSE_CHARS;
  const endedAt = yield* Clock.currentTimeMillis;

  const result: HttpClientSendResult = {
    status: response.status,
    statusText: statusTextFor(response.status),
    headers: headerPairsFrom(response.headers),
    body: truncated ? rawBody.slice(0, HTTP_CLIENT_MAX_RESPONSE_CHARS) : rawBody,
    truncated,
    durationMs: Math.max(0, endedAt - startedAt),
  };
  return result;
});

function headerPairsFrom(headers: Record<string, string>): Array<HttpClientHeaderPair> {
  const pairs: Array<HttpClientHeaderPair> = [];
  for (const name of Object.keys(headers)) {
    const value = headers[name];
    if (typeof value === "string") {
      pairs.push({ name, value });
    }
  }
  return pairs;
}

function statusTextFor(status: number): string {
  try {
    return new Response(null, { status }).statusText;
  } catch {
    return "";
  }
}
