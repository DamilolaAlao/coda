import { AuthSessionId, type ClientActivityLease } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import { childProcessEnvironment } from "../process/hostRuntimeEnv.ts";
import { GitHubTenant } from "./GitHubTenant.ts";

export const GITHUB_HOST = "github.com";
export const OAUTH_STATE_TTL = Duration.minutes(10);

const CredentialRecord = Schema.Struct({
  version: Schema.Literal(1),
  sessionId: AuthSessionId,
  token: Schema.String,
  tokenType: Schema.String,
  scope: Schema.String,
  account: Schema.String,
  userId: Schema.optionalKey(Schema.Number),
  name: Schema.optionalKey(Schema.String),
  host: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type GitHubCredentialRecord = typeof CredentialRecord.Type;
export type GitHubCommitIdentity = {
  readonly name: string;
  readonly email: string;
};

const OAuthStateRecord = Schema.Struct({
  version: Schema.Literal(1),
  state: Schema.String,
  sessionId: Schema.optionalKey(AuthSessionId),
  redirectUri: Schema.String,
  createdAt: Schema.String,
  expiresAt: Schema.String,
});
export type GitHubOAuthStateRecord = typeof OAuthStateRecord.Type;

const encodeCredential = Schema.encodeEffect(Schema.fromJsonString(CredentialRecord));
const decodeCredential = Schema.decodeUnknownEffect(Schema.fromJsonString(CredentialRecord));
const encodeOAuthState = Schema.encodeEffect(Schema.fromJsonString(OAuthStateRecord));
const decodeOAuthState = Schema.decodeUnknownEffect(Schema.fromJsonString(OAuthStateRecord));

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const credentialSecretName = (sessionId: AuthSessionId) =>
  `github-credential-v1-${sessionId}`;
export const oauthStateSecretName = (state: string) => `github-oauth-state-v1-${state}`;

const bytesFromJson = (json: string) => textEncoder.encode(json);
const jsonFromBytes = (bytes: Uint8Array) => textDecoder.decode(bytes);

export const githubProcessEnv = (token: string): NodeJS.ProcessEnv => ({
  GH_TOKEN: token,
  GH_HOST: GITHUB_HOST,
});

export const githubNoreplyEmail = (userId: number, login: string): string =>
  `${userId}+${login}@users.noreply.github.com`;

export const githubGitIdentity = (record: GitHubCredentialRecord): GitHubCommitIdentity => {
  const login = record.account.trim() || "user";
  const name = record.name?.trim() || login;
  const email =
    typeof record.userId === "number"
      ? githubNoreplyEmail(record.userId, login)
      : `${login}@users.noreply.github.com`;
  return { name, email };
};

const gitConfigEnv = (pairs: ReadonlyArray<readonly [string, string]>): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    GIT_CONFIG_COUNT: String(pairs.length),
  };
  for (const [index, [key, value]] of pairs.entries()) {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return env;
};

const githubHttpsExtraHeader = (token: string): readonly [string, string] => [
  `http.https://${GITHUB_HOST}/.extraheader`,
  `AUTHORIZATION: basic ${Encoding.encodeBase64(`x-access-token:${token}`)}`,
];

const githubIdentityConfigPairs = (
  identity: GitHubCommitIdentity,
): ReadonlyArray<readonly [string, string]> => [
  ["user.name", identity.name],
  ["user.email", identity.email],
];

/** Git HTTPS clone env that authenticates without putting the token in argv. */
export const githubHttpsCloneEnv = (token: string): NodeJS.ProcessEnv => ({
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  SSH_ASKPASS: "",
  SSH_ASKPASS_REQUIRE: "never",
  ...gitConfigEnv([githubHttpsExtraHeader(token)]),
});

export const githubChildProcessEnv = (
  record: GitHubCredentialRecord,
  options?: { readonly httpsAuth?: boolean; readonly processToken?: boolean },
): NodeJS.ProcessEnv => {
  const identity = githubGitIdentity(record);
  const pairs: Array<readonly [string, string]> = [];
  if (options?.httpsAuth !== false) {
    pairs.push(githubHttpsExtraHeader(record.token));
  }
  pairs.push(...githubIdentityConfigPairs(identity));
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    SSH_ASKPASS_REQUIRE: "never",
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    ...(options?.processToken === false ? {} : githubProcessEnv(record.token)),
    ...gitConfigEnv(pairs),
  };
};

export const envContainsGitHubToken = (
  env: NodeJS.ProcessEnv | undefined,
  token: string,
): boolean => env?.GH_TOKEN === token;

export class GitHubCredentialStore extends Context.Service<
  GitHubCredentialStore,
  {
    readonly get: (
      sessionId: AuthSessionId,
    ) => Effect.Effect<Option.Option<GitHubCredentialRecord>>;
    readonly set: (record: GitHubCredentialRecord) => Effect.Effect<void>;
    readonly remove: (sessionId: AuthSessionId) => Effect.Effect<void>;
    readonly createOAuthState: (input: {
      readonly sessionId?: AuthSessionId;
      readonly redirectUri: string;
    }) => Effect.Effect<{ readonly state: string }>;
    readonly consumeOAuthState: (
      state: string,
    ) => Effect.Effect<Option.Option<GitHubOAuthStateRecord>>;
  }
>()("t3/sourceControl/GitHubCredentialStore") {}

const cwdMatchesLease = (cwd: string, lease: ClientActivityLease) =>
  lease.scopes.some(
    (scope) => (scope.type === "vcs-status" || scope.type === "git-refs") && scope.cwd === cwd,
  );

export const resolveGitHubProcessCredential = (
  store: GitHubCredentialStore["Service"],
  cwd: string,
) =>
  Effect.gen(function* () {
    const tenant = yield* GitHubTenant;
    if (tenant !== null) {
      return yield* store.get(tenant.sessionId);
    }
    const policy = yield* Effect.serviceOption(BackgroundPolicy.BackgroundPolicy);
    if (Option.isNone(policy)) {
      return Option.none<GitHubCredentialRecord>();
    }
    const snapshot = yield* policy.value.snapshot;
    for (const lease of snapshot.leases) {
      if (!cwdMatchesLease(cwd, lease)) continue;
      const credential = yield* store.get(lease.sessionId);
      if (Option.isSome(credential)) return credential;
    }
    return Option.none<GitHubCredentialRecord>();
  });

export const resolveGitHubChildProcessEnv = (
  store: GitHubCredentialStore["Service"],
  cwd: string,
  options?: { readonly httpsAuth?: boolean; readonly processToken?: boolean },
) =>
  resolveGitHubProcessCredential(store, cwd).pipe(
    Effect.map((credential) =>
      Option.isNone(credential) ? {} : githubChildProcessEnv(credential.value, options),
    ),
  );

export const overlayGitHubChildProcessEnv = (cwd: string, overlay?: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const store = yield* Effect.serviceOption(GitHubCredentialStore);
    const github =
      Option.isNone(store) ? {} : yield* resolveGitHubChildProcessEnv(store.value, cwd);
    return childProcessEnvironment({ ...overlay, ...github });
  });

export const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const crypto = yield* Crypto.Crypto;

  const get: GitHubCredentialStore["Service"]["get"] = (sessionId) =>
    secrets.get(credentialSecretName(sessionId)).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none<GitHubCredentialRecord>()),
          onSome: (bytes) =>
            decodeCredential(jsonFromBytes(bytes)).pipe(
              Effect.map(Option.some),
              Effect.orElseSucceed(() => Option.none<GitHubCredentialRecord>()),
            ),
        }),
      ),
      Effect.orElseSucceed(() => Option.none<GitHubCredentialRecord>()),
    );

  const set: GitHubCredentialStore["Service"]["set"] = (record) =>
    encodeCredential(record).pipe(
      Effect.flatMap((json) =>
        secrets.set(credentialSecretName(record.sessionId), bytesFromJson(json)),
      ),
      Effect.asVoid,
      Effect.orDie,
    );

  const remove: GitHubCredentialStore["Service"]["remove"] = (sessionId) =>
    secrets.remove(credentialSecretName(sessionId)).pipe(Effect.orElseSucceed(() => undefined));

  const createOAuthState: GitHubCredentialStore["Service"]["createOAuthState"] = (input) =>
    Effect.gen(function* () {
      const state = Encoding.encodeBase64Url(yield* crypto.randomBytes(32));
      const now = yield* DateTime.now;
      const record: GitHubOAuthStateRecord = {
        version: 1,
        state,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        redirectUri: input.redirectUri,
        createdAt: DateTime.formatIso(now),
        expiresAt: DateTime.formatIso(DateTime.addDuration(now, OAUTH_STATE_TTL)),
      };
      const json = yield* encodeOAuthState(record);
      yield* secrets.set(oauthStateSecretName(state), bytesFromJson(json));
      return { state };
    }).pipe(Effect.orDie);

  const consumeOAuthState: GitHubCredentialStore["Service"]["consumeOAuthState"] = (state) =>
    Effect.gen(function* () {
      const name = oauthStateSecretName(state);
      const raw = yield* secrets.get(name);
      yield* secrets.remove(name);
      if (Option.isNone(raw)) return Option.none();
      const decoded = yield* decodeOAuthState(jsonFromBytes(raw.value)).pipe(Effect.option);
      if (Option.isNone(decoded)) return Option.none();
      const expiresAtMs = Date.parse(decoded.value.expiresAt);
      const now = yield* DateTime.now;
      if (!Number.isFinite(expiresAtMs) || now.epochMilliseconds >= expiresAtMs) {
        return Option.none();
      }
      return Option.some(decoded.value);
    }).pipe(Effect.orElseSucceed(() => Option.none<GitHubOAuthStateRecord>()));

  return GitHubCredentialStore.of({
    get,
    set,
    remove,
    createOAuthState,
    consumeOAuthState,
  });
});

export const layer = Layer.effect(GitHubCredentialStore, make);
export const layerLive = layer.pipe(Layer.provide(ServerSecretStore.layer));
