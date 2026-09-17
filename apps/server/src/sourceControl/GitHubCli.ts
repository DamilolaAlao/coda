import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parseGitHubRepositoryLocator } from "@t3tools/shared/git";

export { parseGitHubRepositoryLocator } from "@t3tools/shared/git";

import {
  TrimmedNonEmptyString,
  type SourceControlRepositoryVisibility,
  type VcsError,
} from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import {
  GitHubCredentialStore,
  githubProcessEnv,
  resolveGitHubProcessCredential,
} from "./GitHubCredentialStore.ts";
import {
  decodeGitHubPullRequestJson,
  decodeGitHubPullRequestListJson,
} from "./gitHubPullRequests.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const githubApiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "coda",
} as const;

const gitHubCliFailureFields = {
  command: Schema.Literal("gh"),
  cwd: Schema.String,
  cause: Schema.Defect(),
} as const;

export class GitHubCliUnavailableError extends Schema.TaggedErrorClass<GitHubCliUnavailableError>()(
  "GitHubCliUnavailableError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI (`gh`) is required but not available on PATH.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubCliAuthenticationError extends Schema.TaggedErrorClass<GitHubCliAuthenticationError>()(
  "GitHubCliAuthenticationError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI is not authenticated. Connect GitHub in Settings, or run `gh auth login` on the server.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubCliRateLimitError extends Schema.TaggedErrorClass<GitHubCliRateLimitError>()(
  "GitHubCliRateLimitError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub API rate limit exceeded. Run `gh api rate_limit` to inspect the quota and reset time.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubPullRequestNotFoundError extends Schema.TaggedErrorClass<GitHubPullRequestNotFoundError>()(
  "GitHubPullRequestNotFoundError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "Pull request not found. Check the PR number or URL and try again.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubCliCommandError extends Schema.TaggedErrorClass<GitHubCliCommandError>()(
  "GitHubCliCommandError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI command failed.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

const gitHubCliDecodeFields = {
  command: Schema.Literal("gh"),
  cwd: Schema.String,
  cause: Schema.Defect(),
} as const;

export class GitHubPullRequestListDecodeError extends Schema.TaggedErrorClass<GitHubPullRequestListDecodeError>()(
  "GitHubPullRequestListDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid PR list JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in listOpenPullRequests: ${this.detail}`;
  }
}

export class GitHubChangeRequestListDecodeError extends Schema.TaggedErrorClass<GitHubChangeRequestListDecodeError>()(
  "GitHubChangeRequestListDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid change request JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in listChangeRequests: ${this.detail}`;
  }
}

export class GitHubPullRequestDecodeError extends Schema.TaggedErrorClass<GitHubPullRequestDecodeError>()(
  "GitHubPullRequestDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid pull request JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequest: ${this.detail}`;
  }
}

export class GitHubRepositoryLookupError extends Schema.TaggedErrorClass<GitHubRepositoryLookupError>()(
  "GitHubRepositoryLookupError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub could not look up that repository.";
  }

  override get message(): string {
    return `GitHub CLI failed in getRepositoryCloneUrls: ${this.detail}`;
  }
}

export class GitHubRepositoryInvalidReferenceError extends Schema.TaggedErrorClass<GitHubRepositoryInvalidReferenceError>()(
  "GitHubRepositoryInvalidReferenceError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "Enter a GitHub repository as owner/repo or a github.com URL.";
  }

  override get message(): string {
    return `GitHub CLI failed in getRepositoryCloneUrls: ${this.detail}`;
  }
}

export class GitHubRepositoryNotFoundError extends Schema.TaggedErrorClass<GitHubRepositoryNotFoundError>()(
  "GitHubRepositoryNotFoundError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "Repository not found or this GitHub account cannot access it.";
  }

  override get message(): string {
    return `GitHub CLI failed in getRepositoryCloneUrls: ${this.detail}`;
  }
}

export class GitHubRepositoryDecodeError extends Schema.TaggedErrorClass<GitHubRepositoryDecodeError>()(
  "GitHubRepositoryDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid repository JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in getRepositoryCloneUrls: ${this.detail}`;
  }
}

export const GitHubCliError = Schema.Union([
  GitHubCliUnavailableError,
  GitHubCliAuthenticationError,
  GitHubCliRateLimitError,
  GitHubPullRequestNotFoundError,
  GitHubRepositoryNotFoundError,
  GitHubRepositoryInvalidReferenceError,
  GitHubRepositoryLookupError,
  GitHubCliCommandError,
  GitHubPullRequestListDecodeError,
  GitHubChangeRequestListDecodeError,
  GitHubPullRequestDecodeError,
  GitHubRepositoryDecodeError,
]);
export type GitHubCliError = typeof GitHubCliError.Type;

export const isGitHubCliError = Schema.is(GitHubCliError);

export function fromVcsError(
  context: {
    readonly command: "gh";
    readonly cwd: string;
  },
  error: VcsError,
): GitHubCliError {
  if (
    error._tag === "VcsProcessSpawnError" &&
    error.cause instanceof PlatformError.PlatformError &&
    error.cause.reason._tag === "NotFound" &&
    error.cause.reason.module === "ChildProcess" &&
    error.cause.reason.method === "spawn"
  ) {
    return new GitHubCliUnavailableError({ ...context, cause: error });
  }

  if (error._tag === "VcsProcessExitError") {
    if (error.failureKind === "authentication") {
      return new GitHubCliAuthenticationError({ ...context, cause: error });
    }
    if (error.failureKind === "rate-limited") {
      return new GitHubCliRateLimitError({ ...context, cause: error });
    }
    if (error.failureKind === "not-found") {
      return new GitHubPullRequestNotFoundError({ ...context, cause: error });
    }
  }

  return new GitHubCliCommandError({ ...context, cause: error });
}

export interface GitHubPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state?: "open" | "closed" | "merged";
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

export interface GitHubRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export class GitHubCli extends Context.Service<
  GitHubCli,
  {
    readonly execute: (input: {
      readonly cwd: string;
      readonly args: ReadonlyArray<string>;
      readonly timeoutMs?: number;
      /** Piped to the child's stdin, for payloads that must never appear in argv. */
      readonly stdin?: string;
      readonly maxOutputBytes?: number;
    }) => Effect.Effect<VcsProcess.VcsProcessOutput, GitHubCliError>;

    readonly listOpenPullRequests: (input: {
      readonly cwd: string;
      readonly headSelector: string;
      readonly limit?: number;
    }) => Effect.Effect<ReadonlyArray<GitHubPullRequestSummary>, GitHubCliError>;

    readonly getPullRequest: (input: {
      readonly cwd: string;
      readonly reference: string;
    }) => Effect.Effect<GitHubPullRequestSummary, GitHubCliError>;

    readonly getRepositoryCloneUrls: (input: {
      readonly cwd: string;
      readonly repository: string;
    }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

    readonly searchRepositories: (input: {
      readonly cwd: string;
      readonly query: string;
      readonly limit?: number;
      readonly ownerOnly?: boolean;
    }) => Effect.Effect<ReadonlyArray<GitHubRepositoryCloneUrls>, GitHubCliError>;

    readonly createRepository: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly visibility: SourceControlRepositoryVisibility;
    }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

    readonly createPullRequest: (input: {
      readonly cwd: string;
      readonly baseBranch: string;
      readonly headSelector: string;
      readonly title: string;
      readonly bodyFile: string;
    }) => Effect.Effect<void, GitHubCliError>;

    readonly getDefaultBranch: (input: {
      readonly cwd: string;
    }) => Effect.Effect<string | null, GitHubCliError>;

    readonly checkoutPullRequest: (input: {
      readonly cwd: string;
      readonly reference: string;
      readonly force?: boolean;
    }) => Effect.Effect<void, GitHubCliError>;
  }
>()("t3/sourceControl/GitHubCli") {}

const RawGitHubRepositoryCloneUrlsSchema = Schema.Struct({
  nameWithOwner: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  sshUrl: TrimmedNonEmptyString,
});
const decodeRawGitHubRepositoryCloneUrls = Schema.decodeEffect(
  Schema.fromJsonString(RawGitHubRepositoryCloneUrlsSchema),
);

function normalizeRepositoryCloneUrls(
  raw: Schema.Schema.Type<typeof RawGitHubRepositoryCloneUrlsSchema>,
): GitHubRepositoryCloneUrls {
  return {
    nameWithOwner: raw.nameWithOwner,
    url: raw.url,
    sshUrl: raw.sshUrl,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cloneUrlsFromLocator(locator: { owner: string; repo: string }): GitHubRepositoryCloneUrls {
  const nameWithOwner = `${locator.owner}/${locator.repo}`;
  return {
    nameWithOwner,
    url: `https://github.com/${nameWithOwner}`,
    sshUrl: `git@github.com:${nameWithOwner}.git`,
  };
}

function cloneUrlsFromGitHubRest(
  json: unknown,
  locator: { owner: string; repo: string },
): GitHubRepositoryCloneUrls {
  const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const fallback = cloneUrlsFromLocator(locator);
  const nameWithOwner = nonEmptyString(record.full_name) ?? fallback.nameWithOwner;
  const cloneUrl = nonEmptyString(record.clone_url)?.replace(/\.git$/i, "");
  return {
    nameWithOwner,
    url: nonEmptyString(record.html_url) || cloneUrl || fallback.url,
    sshUrl: nonEmptyString(record.ssh_url) || `git@github.com:${nameWithOwner}.git`,
  };
}

/**
 * `gh repo create` prints the canonical URL of the new repository on stdout
 * (e.g. `https://github.com/owner/repo`). Reading it back here avoids a
 * follow-up `gh repo view`, which can race GitHub's GraphQL eventual
 * consistency window and falsely report the just-created repo as missing.
 */
function deriveRepositoryCloneUrlsFromCreateOutput(
  stdout: string,
  repository: string,
): GitHubRepositoryCloneUrls {
  const fallbackHost = "github.com";
  const match = stdout.match(/https?:\/\/[^\s]+/);
  if (match) {
    const cleaned = match[0].replace(/\.git$/, "");
    try {
      const parsed = new URL(cleaned);
      const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length === 2) {
        const nameWithOwner = `${segments[0]}/${segments[1]}`;
        return {
          nameWithOwner,
          url: `${parsed.origin}/${nameWithOwner}`,
          sshUrl: `git@${parsed.host}:${nameWithOwner}.git`,
        };
      }
    } catch {
      // Fall through to the input-derived defaults below.
    }
  }
  return {
    nameWithOwner: repository,
    url: `https://${fallbackHost}/${repository}`,
    sshUrl: `git@${fallbackHost}:${repository}.git`,
  };
}

export const make = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;
  const store = yield* GitHubCredentialStore;

  const lookupRepositoryCloneUrlsViaApi = Effect.fn("GitHubCli.lookupRepositoryCloneUrlsViaApi")(
    function* (input: {
      readonly cwd: string;
      readonly token: string;
      readonly locator: { owner: string; repo: string };
    }) {
      const url = `https://api.github.com/repos/${encodeURIComponent(input.locator.owner)}/${encodeURIComponent(input.locator.repo)}`;
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            headers: {
              ...githubApiHeaders,
              Authorization: `Bearer ${input.token.trim()}`,
            },
          }),
        catch: (cause) =>
          new GitHubRepositoryLookupError({
            command: "gh",
            cwd: input.cwd,
            cause,
          }),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("GitHub repository API fetch failed", {
            owner: input.locator.owner,
            repo: input.locator.repo,
            message: error.cause instanceof Error ? error.cause.message : "unknown",
          }),
        ),
      );
      if (response.status === 401 || response.status === 403) {
        yield* Effect.logWarning("GitHub repository API lookup failed", {
          status: response.status,
          owner: input.locator.owner,
          repo: input.locator.repo,
        });
        return yield* new GitHubCliAuthenticationError({
          command: "gh",
          cwd: input.cwd,
          cause: new Error(`GitHub repository lookup failed with HTTP ${response.status}`),
        });
      }
      if (response.status === 404) {
        yield* Effect.logWarning("GitHub repository API lookup failed", {
          status: response.status,
          owner: input.locator.owner,
          repo: input.locator.repo,
        });
        return yield* new GitHubRepositoryNotFoundError({
          command: "gh",
          cwd: input.cwd,
          cause: new Error("GitHub repository lookup failed with HTTP 404"),
        });
      }
      if (response.status !== 200) {
        yield* Effect.logWarning("GitHub repository API lookup failed", {
          status: response.status,
          owner: input.locator.owner,
          repo: input.locator.repo,
        });
        return yield* new GitHubRepositoryLookupError({
          command: "gh",
          cwd: input.cwd,
          cause: new Error(`GitHub repository lookup failed with HTTP ${response.status}`),
        });
      }
      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (cause) => cause,
      }).pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("GitHub repository API JSON parse failed", {
            owner: input.locator.owner,
            repo: input.locator.repo,
            message: cause instanceof Error ? cause.message : "unknown",
          }),
        ),
        Effect.orElseSucceed(() => null),
      );
      return cloneUrlsFromGitHubRest(json, input.locator);
    },
  );

  function buildGitHubRepositorySearchQuery(input: {
    readonly query: string;
    readonly ownerOnly: boolean;
    readonly account: string | null;
  }): string {
    const terms: string[] = [];
    if (input.ownerOnly) {
      const account = input.account?.trim();
      if (account) {
        terms.push(`user:${account}`);
      }
    }
    terms.push(`${input.query.trim()} in:name fork:true`);
    return terms.join(" ");
  }

  const searchGitHubRepositoriesViaApi = Effect.fn("GitHubCli.searchGitHubRepositoriesViaApi")(
    function* (input: {
      readonly cwd: string;
      readonly token: string;
      readonly query: string;
      readonly limit: number;
      readonly ownerOnly: boolean;
      readonly account: string | null;
    }) {
      const query = input.query.trim();
      const url =
        query.length === 0
          ? `https://api.github.com/user/repos?per_page=${input.limit}&sort=updated&direction=desc&visibility=all&affiliation=${
              input.ownerOnly ? "owner" : "owner,collaborator,organization_member"
            }`
          : `https://api.github.com/search/repositories?q=${encodeURIComponent(
              buildGitHubRepositorySearchQuery(input),
            )}&per_page=${input.limit}&sort=updated`;
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            headers: {
              ...githubApiHeaders,
              Authorization: `Bearer ${input.token.trim()}`,
            },
          }),
        catch: (cause) =>
          new GitHubRepositoryLookupError({
            command: "gh",
            cwd: input.cwd,
            cause,
          }),
      }).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("GitHub repository search fetch failed", {
            query: input.query,
            message: error.cause instanceof Error ? error.cause.message : "unknown",
          }),
        ),
      );
      if (response.status === 401 || response.status === 403) {
        return yield* new GitHubCliAuthenticationError({
          command: "gh",
          cwd: input.cwd,
          cause: new Error(`GitHub repository search failed with HTTP ${response.status}`),
        });
      }
      if (response.status !== 200) {
        yield* Effect.logWarning("GitHub repository search failed", {
          status: response.status,
          query: input.query,
        });
        return yield* new GitHubRepositoryLookupError({
          command: "gh",
          cwd: input.cwd,
          cause: new Error(`GitHub repository search failed with HTTP ${response.status}`),
        });
      }
      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (cause) => cause,
      }).pipe(Effect.orElseSucceed(() => null));
      const items =
        query.length === 0
          ? Array.isArray(json)
            ? json
            : []
          : json !== null &&
              typeof json === "object" &&
              Array.isArray((json as { items?: unknown }).items)
            ? ((json as { items: ReadonlyArray<unknown> }).items ?? [])
            : [];
      const repositories: GitHubRepositoryCloneUrls[] = [];
      for (const item of items) {
        if (item === null || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const fullName = nonEmptyString(record.full_name);
        if (!fullName) continue;
        const [owner, repo] = fullName.split("/");
        if (!owner || !repo) continue;
        repositories.push(cloneUrlsFromGitHubRest(item, { owner, repo }));
      }
      return repositories;
    },
  );

  const execute: GitHubCli["Service"]["execute"] = (input) =>
    resolveGitHubProcessCredential(store, input.cwd).pipe(
      Effect.flatMap((credential) =>
        process
          .run({
            operation: "GitHubCli.execute",
            command: "gh",
            args: input.args,
            cwd: input.cwd,
            timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            ...(input.stdin !== undefined ? { stdin: input.stdin } : {}),
            ...(input.maxOutputBytes !== undefined ? { maxOutputBytes: input.maxOutputBytes } : {}),
            ...(Option.isSome(credential) ? { env: githubProcessEnv(credential.value.token) } : {}),
          })
          .pipe(Effect.mapError((error) => fromVcsError({ command: "gh", cwd: input.cwd }, error))),
      ),
    );

  return GitHubCli.of({
    execute,
    listOpenPullRequests: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "list",
          "--head",
          input.headSelector,
          "--state",
          "open",
          "--limit",
          String(input.limit ?? 1),
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          raw.length === 0
            ? Effect.succeed([])
            : Effect.sync(() => decodeGitHubPullRequestListJson(raw)).pipe(
                Effect.flatMap((decoded) => {
                  if (!Result.isSuccess(decoded)) {
                    return Effect.fail(
                      new GitHubPullRequestListDecodeError({
                        command: "gh",
                        cwd: input.cwd,
                        cause: decoded.failure,
                      }),
                    );
                  }

                  return Effect.succeed(
                    decoded.success.map(({ updatedAt: _updatedAt, ...summary }) => summary),
                  );
                }),
              ),
        ),
      ),
    getPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "view",
          input.reference,
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          Effect.sync(() => decodeGitHubPullRequestJson(raw)).pipe(
            Effect.flatMap((decoded) => {
              if (!Result.isSuccess(decoded)) {
                return Effect.fail(
                  new GitHubPullRequestDecodeError({
                    command: "gh",
                    cwd: input.cwd,
                    cause: decoded.failure,
                  }),
                );
              }

              return Effect.succeed(
                (({ updatedAt: _updatedAt, ...summary }) => summary)(decoded.success),
              );
            }),
          ),
        ),
      ),
    getRepositoryCloneUrls: (input) =>
      resolveGitHubProcessCredential(store, input.cwd).pipe(
        Effect.flatMap((credential) => {
          const locator = parseGitHubRepositoryLocator(input.repository);
          if (Option.isSome(credential)) {
            if (locator === null) {
              return Effect.logWarning("GitHub repository reference was not owner/repo", {
                repository: input.repository,
              }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new GitHubRepositoryInvalidReferenceError({
                      command: "gh",
                      cwd: input.cwd,
                      cause: new Error("unrecognized GitHub repository reference"),
                    }),
                  ),
                ),
              );
            }
            return lookupRepositoryCloneUrlsViaApi({
              cwd: input.cwd,
              token: credential.value.token,
              locator,
            });
          }
          return execute({
            cwd: input.cwd,
            args: ["repo", "view", input.repository, "--json", "nameWithOwner,url,sshUrl"],
          }).pipe(
            Effect.map((result) => result.stdout.trim()),
            Effect.flatMap((raw) =>
              decodeRawGitHubRepositoryCloneUrls(raw).pipe(
                Effect.mapError(
                  (cause) =>
                    new GitHubRepositoryDecodeError({
                      command: "gh",
                      cwd: input.cwd,
                      cause,
                    }),
                ),
              ),
            ),
            Effect.map(normalizeRepositoryCloneUrls),
          );
        }),
      ),
    searchRepositories: (input) =>
      resolveGitHubProcessCredential(store, input.cwd).pipe(
        Effect.flatMap((credential) => {
          if (Option.isNone(credential)) {
            return Effect.fail(
              new GitHubCliAuthenticationError({
                command: "gh",
                cwd: input.cwd,
                cause: new Error("GitHub repository search requires an authenticated session"),
              }),
            );
          }
          return searchGitHubRepositoriesViaApi({
            cwd: input.cwd,
            token: credential.value.token,
            query: input.query,
            limit: Math.min(Math.max(input.limit ?? 10, 1), 30),
            ownerOnly: input.ownerOnly !== false,
            account: credential.value.account,
          });
        }),
      ),
    createRepository: (input) =>
      execute({
        cwd: input.cwd,
        args: ["repo", "create", input.repository, `--${input.visibility}`],
      }).pipe(
        Effect.map((result) =>
          deriveRepositoryCloneUrlsFromCreateOutput(result.stdout, input.repository),
        ),
      ),
    createPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "create",
          "--base",
          input.baseBranch,
          "--head",
          input.headSelector,
          "--title",
          input.title,
          "--body-file",
          input.bodyFile,
        ],
      }).pipe(Effect.asVoid),
    getDefaultBranch: (input) =>
      execute({
        cwd: input.cwd,
        args: ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
      }).pipe(
        Effect.map((value) => {
          const trimmed = value.stdout.trim();
          return trimmed.length > 0 ? trimmed : null;
        }),
      ),
    checkoutPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: ["pr", "checkout", input.reference, ...(input.force ? ["--force"] : [])],
      }).pipe(Effect.asVoid),
  });
});

export const layer = Layer.effect(GitHubCli, make);
