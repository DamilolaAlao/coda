import { AuthOrchestrationOperateScope, EnvironmentHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  failEnvironmentInvalidRequest,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { sendHttpClientRequest, type HttpClientSendFailure } from "./send.ts";

export const httpClientHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "httpClient",
  Effect.fnUntraced(function* (handlers) {
    return handlers.handle(
      "send",
      Effect.fn("environment.httpClient.send")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
        const result = yield* sendHttpClientRequest(args.payload).pipe(
          Effect.catch((failure: HttpClientSendFailure) => mapSendFailure(failure)),
        );
        return result;
      }),
    );
  }),
);

function mapSendFailure(failure: HttpClientSendFailure) {
  if (failure === "invalid_http_target") {
    return failEnvironmentInvalidRequest("invalid_http_target");
  }
  return failEnvironmentInternal("http_client_send_failed");
}
