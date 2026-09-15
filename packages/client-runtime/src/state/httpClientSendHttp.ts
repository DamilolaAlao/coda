import type { HttpClientSendInput, HttpClientSendResult } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient } from "effect/unstable/http";

import type { PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiClient,
  makeEnvironmentHttpApiUrlBuilder,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";
import { buildEnvironmentAuthHeaders, withEnvironmentCredentials } from "./environmentHttpAuth.ts";

const DEFAULT_HTTP_CLIENT_SEND_TIMEOUT_MS = 70_000;

export const fetchEnvironmentHttpClientSend = Effect.fn(
  "clientRuntime.state.fetchEnvironmentHttpClientSend",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly request: HttpClientSendInput;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly timeoutMs?: number;
}) {
  const requestUrl = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl).httpClient.send();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const headers = yield* buildEnvironmentAuthHeaders(
    input.prepared.httpAuthorization,
    "POST",
    requestUrl,
    input.signer,
  );
  return yield* executeEnvironmentHttpRequest(
    requestUrl,
    input.timeoutMs ?? DEFAULT_HTTP_CLIENT_SEND_TIMEOUT_MS,
    withEnvironmentCredentials(
      input.prepared.httpAuthorization,
      client.httpClient.send({ payload: input.request, headers }),
    ),
  );
});

export class HttpClientSendLoader extends Context.Service<
  HttpClientSendLoader,
  {
    readonly send: (
      prepared: PreparedConnection,
      request: HttpClientSendInput,
    ) => Effect.Effect<HttpClientSendResult, RemoteEnvironmentRequestError>;
  }
>()("@t3tools/client-runtime/state/httpClientSendHttp/HttpClientSendLoader") {}

export const httpClientSendLoaderLayer: Layer.Layer<
  HttpClientSendLoader,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  HttpClientSendLoader,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    return HttpClientSendLoader.of({
      send: (prepared, request) =>
        fetchEnvironmentHttpClientSend({ prepared, request, signer }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
        ),
    });
  }),
);
