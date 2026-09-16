import * as NodeOS from "node:os";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  SourceControlProviderError,
  SourceControlRepositoryError,
  type SourceControlCloneRepositoryInput,
  type SourceControlCloneRepositoryResult,
  type SourceControlCloneProtocol,
  type SourceControlProviderKind,
  type SourceControlPublishRepositoryInput,
  type SourceControlPublishRepositoryResult,
  type SourceControlRepositoryCloneUrls,
  type SourceControlRepositoryInfo,
  type SourceControlRepositoryLookupInput,
  type SourceControlRepositorySearchInput,
  type SourceControlRepositorySearchResult,
} from "@t3tools/contracts";

import {
  cloneDirectoryNameFromRepositoryRef,
  parseGitHubRepositoryLocator,
} from "@t3tools/shared/git";

import { ServerConfig } from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as GitHubCli from "./GitHubCli.ts";
import {
  GitHubCredentialStore,
  githubHttpsCloneEnv,
  resolveGitHubProcessCredential,
} from "./GitHubCredentialStore.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";
const isSourceControlRepositoryError = Schema.is(SourceControlRepositoryError);
const isSourceControlProviderError = Schema.is(SourceControlProviderError);

const GITHUB_CLONE_AUTH_DETAIL =
  "Could not clone that GitHub repository. Connect GitHub in Settings, then try again.";
const GITHUB_CLONE_FAILED_DETAIL = "Git could not clone that repository.";

const SAFE_GITHUB_OPERATION_DETAILS = new Set([
  "GitHub CLI (`gh`) is required but not available on PATH.",
  "GitHub CLI is not authenticated. Connect GitHub in Settings, or run `gh auth login` on the server.",
  "Enter a GitHub repository as owner/repo or a github.com URL.",
  "Repository not found or this GitHub account cannot access it.",
  "GitHub could not look up that repository.",
  GITHUB_CLONE_AUTH_DETAIL,
  GITHUB_CLONE_FAILED_DETAIL,
]);

function publicRepositoryErrorDetail(cause: unknown): string | null {
  if (!isSourceControlProviderError(cause)) return null;
  if (
    SAFE_GITHUB_OPERATION_DETAILS.has(cause.detail) ||
    cause.detail.startsWith("GitHub API rate limit exceeded")
  ) {
    return cause.detail;
  }
  return null;
}

export class SourceControlRepositoryService extends Context.Service<
  SourceControlRepositoryService,
  {
    readonly lookupRepository: (
      input: SourceControlRepositoryLookupInput,
    ) => Effect.Effect<SourceControlRepositoryInfo, SourceControlRepositoryError>;
    readonly searchRepositories: (
      input: SourceControlRepositorySearchInput,
    ) => Effect.Effect<SourceControlRepositorySearchResult, SourceControlRepositoryError>;
    readonly cloneRepository: (
      input: SourceControlCloneRepositoryInput,
    ) => Effect.Effect<SourceControlCloneRepositoryResult, SourceControlRepositoryError>;
    readonly publishRepository: (
      input: SourceControlPublishRepositoryInput,
    ) => Effect.Effect<SourceControlPublishRepositoryResult, SourceControlRepositoryError>;
  }
>()("t3/sourceControl/SourceControlRepositoryService") {}

function mapRepositoryError(operation: string, provider: SourceControlProviderKind) {
  return Effect.mapError((cause: unknown) => {
    if (isSourceControlRepositoryError(cause)) return cause;
    const publicDetail = publicRepositoryErrorDetail(cause);
    return new SourceControlRepositoryError({
      operation,
      provider,
      detail: publicDetail ?? "The source control operation could not be completed.",
      cause,
    });
  });
}

function toRepositoryInfo(
  provider: SourceControlProviderKind,
  urls: SourceControlRepositoryCloneUrls,
): SourceControlRepositoryInfo {
  return {
    provider,
    nameWithOwner: urls.nameWithOwner,
    url: urls.url,
    sshUrl: urls.sshUrl,
  };
}

function selectRemoteUrl(
  urls: SourceControlRepositoryCloneUrls,
  protocol: SourceControlCloneProtocol | undefined,
): string {
  switch (protocol ?? "auto") {
    case "https":
      return urls.url;
    case "ssh":
    case "auto":
      return urls.sshUrl;
  }
}

function githubHttpsRemoteUrl(locator: { owner: string; repo: string }): string {
  return `https://github.com/${locator.owner}/${locator.repo}.git`;
}

function publicCloneFailureDetail(stderr: string, isGitHub: boolean): string {
  const detail = stderr.toLowerCase();
  if (
    detail.includes("permission denied") ||
    detail.includes("could not read from remote") ||
    detail.includes("authentication failed") ||
    detail.includes("invalid username or token") ||
    detail.includes("host key verification failed") ||
    detail.includes("no such identity")
  ) {
    return isGitHub ? GITHUB_CLONE_AUTH_DETAIL : GITHUB_CLONE_FAILED_DETAIL;
  }
  if (
    isGitHub &&
    (detail.includes("repository not found") ||
      detail.includes("http 404") ||
      detail.includes("http 403"))
  ) {
    return "Repository not found or this GitHub account cannot access it.";
  }
  return GITHUB_CLONE_FAILED_DETAIL;
}

function expandHomePath(input: string, path: Path.Path): string {
  if (input === "~") {
    return NodeOS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(NodeOS.homedir(), input.slice(2));
  }
  return input;
}

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const path = yield* Path.Path;
  const providers = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;
  const github = yield* GitHubCli.GitHubCli;
  const githubCredentials = yield* GitHubCredentialStore;

  const ensureConcreteProvider = (input: {
    readonly operation: string;
    readonly provider: SourceControlProviderKind;
  }) => {
    if (input.provider !== "unknown") {
      return Effect.succeed(input.provider);
    }

    return Effect.fail(
      new SourceControlRepositoryError({
        operation: input.operation,
        provider: input.provider,
        detail: "Choose a source control provider before continuing.",
      }),
    );
  };

  const lookupRepository = Effect.fn("SourceControlRepositoryService.lookupRepository")(function* (
    input: SourceControlRepositoryLookupInput,
  ) {
    const providerKind = yield* ensureConcreteProvider({
      operation: "lookupRepository",
      provider: input.provider,
    });
    const provider = yield* providers.get(providerKind);
    const urls = yield* provider.getRepositoryCloneUrls({
      cwd: input.cwd ?? config.cwd,
      repository: input.repository.trim(),
    });
    return toRepositoryInfo(providerKind, urls);
  });

  const searchRepositories = Effect.fn("SourceControlRepositoryService.searchRepositories")(
    function* (input: SourceControlRepositorySearchInput) {
      const providerKind = yield* ensureConcreteProvider({
        operation: "searchRepositories",
        provider: input.provider,
      });
      if (providerKind !== "github") {
        return { repositories: [] };
      }
      const urls = yield* github.searchRepositories({
        cwd: input.cwd ?? config.cwd,
        query: input.query.trim(),
        limit: input.limit ?? 10,
        ownerOnly: input.ownerOnly,
      }).pipe(
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: "github",
              operation: "searchRepositories",
              cwd: input.cwd ?? config.cwd,
              detail: error.detail,
              cause: error,
            }),
        ),
      );
      return {
        repositories: urls.map((entry) => toRepositoryInfo("github", entry)),
      };
    },
  );

  const normalizeDestinationPath = Effect.fn("SourceControlRepositoryService.normalizeDestination")(
    function* (destinationPath: string) {
      const trimmed = destinationPath.trim();
      if (trimmed.length === 0) {
        return yield* new SourceControlRepositoryError({
          operation: "cloneRepository",
          provider: "unknown",
          detail: "Choose a destination path before cloning.",
        });
      }

      return path.resolve(expandHomePath(trimmed, path));
    },
  );

  const prepareDestination = Effect.fn("SourceControlRepositoryService.prepareDestination")(
    function* (destinationPath: string, occupiedParentDirectoryName: string | null) {
      const normalizedDestination = yield* normalizeDestinationPath(destinationPath);
      if (yield* fileSystem.exists(normalizedDestination)) {
        const entries = yield* fileSystem
          .readDirectory(normalizedDestination, { recursive: false })
          .pipe(
            Effect.mapError(
              (cause) =>
                new SourceControlRepositoryError({
                  operation: "cloneRepository",
                  provider: "unknown",
                  detail: "Destination path already exists and is not a directory.",
                  cause,
                }),
            ),
          );
        if (entries.length > 0) {
          if (occupiedParentDirectoryName) {
            return yield* prepareDestination(
              path.join(normalizedDestination, occupiedParentDirectoryName),
              null,
            );
          }
          return yield* new SourceControlRepositoryError({
            operation: "cloneRepository",
            provider: "unknown",
            detail: "Destination path already exists and is not empty.",
          });
        }
      } else {
        yield* fileSystem.makeDirectory(path.dirname(normalizedDestination), { recursive: true });
      }

      return {
        destinationPath: normalizedDestination,
        parentPath: path.dirname(normalizedDestination),
        directoryName: path.basename(normalizedDestination),
      };
    },
  );

  const cloneRepository = Effect.fn("SourceControlRepositoryService.cloneRepository")(function* (
    input: SourceControlCloneRepositoryInput,
  ) {
    const preparedDestination = yield* prepareDestination(
      input.destinationPath,
      cloneDirectoryNameFromRepositoryRef(input.repository ?? input.remoteUrl ?? ""),
    );
    let repository: SourceControlRepositoryInfo | null = null;
    let remoteUrl = input.remoteUrl?.trim() ?? null;
    let provider: SourceControlProviderKind = input.provider ?? "unknown";

    if (input.provider && input.repository) {
      repository = yield* lookupRepository({
        provider: input.provider,
        repository: input.repository,
        cwd: preparedDestination.parentPath,
      });
      remoteUrl = selectRemoteUrl(repository, input.protocol);
      provider = input.provider;
    }

    if (!remoteUrl) {
      return yield* new SourceControlRepositoryError({
        operation: "cloneRepository",
        provider,
        detail: "Enter a repository path or clone URL before cloning.",
      });
    }

    const githubLocator = parseGitHubRepositoryLocator(input.repository ?? remoteUrl);
    const githubCredential = githubLocator
      ? yield* resolveGitHubProcessCredential(githubCredentials, preparedDestination.parentPath)
      : Option.none();

    let cloneUrl = remoteUrl;
    let cloneEnv: NodeJS.ProcessEnv | undefined;
    if (githubLocator && Option.isSome(githubCredential) && input.protocol !== "ssh") {
      cloneUrl = githubHttpsRemoteUrl(githubLocator);
      remoteUrl = cloneUrl;
      cloneEnv = githubHttpsCloneEnv(githubCredential.value.token);
      if (provider === "unknown") {
        provider = "github";
      }
    }

    const cloneResult = yield* git.execute({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: preparedDestination.parentPath,
      args: ["clone", cloneUrl, preparedDestination.directoryName],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
      allowNonZeroExit: true,
      ...(cloneEnv !== undefined ? { env: cloneEnv } : {}),
    });
    if (cloneResult.exitCode !== 0) {
      const detail = publicCloneFailureDetail(cloneResult.stderr, githubLocator !== null);
      yield* Effect.logWarning("sourceControl.cloneRepository git failed", {
        provider,
        detail,
        exitCode: cloneResult.exitCode,
        repository: input.repository ?? input.remoteUrl ?? "",
      });
      return yield* new SourceControlRepositoryError({
        operation: "cloneRepository",
        provider,
        detail,
      });
    }

    if (cloneEnv !== undefined) {
      yield* git.execute({
        operation: "SourceControlRepositoryService.cloneRepository.setOrigin",
        cwd: preparedDestination.destinationPath,
        args: ["remote", "set-url", "origin", cloneUrl],
        timeoutMs: 10_000,
        maxOutputBytes: 16 * 1024,
      });
    }

    return {
      cwd: preparedDestination.destinationPath,
      remoteUrl,
      repository,
    };
  });

  const publishRepository = Effect.fn("SourceControlRepositoryService.publishRepository")(
    function* (input: SourceControlPublishRepositoryInput) {
      const providerKind = yield* ensureConcreteProvider({
        operation: "publishRepository",
        provider: input.provider,
      });
      const provider = yield* providers.get(providerKind);
      const urls = yield* provider.createRepository({
        cwd: input.cwd,
        repository: input.repository.trim(),
        visibility: input.visibility,
      });
      const remoteUrl = selectRemoteUrl(urls, input.protocol);
      const remoteName = yield* git.ensureRemote({
        cwd: input.cwd,
        preferredName: input.remoteName?.trim() || "origin",
        url: remoteUrl,
      });

      // An empty local repo (no commits) would make `git push HEAD:...` fail
      // with an opaque "src refspec HEAD does not match any". Treat this as a
      // partial success: the remote was created and wired up, but there is
      // nothing to push yet.
      const hasCommits = yield* git
        .execute({
          operation: "SourceControlRepositoryService.publishRepository.headCheck",
          cwd: input.cwd,
          args: ["rev-parse", "--verify", "HEAD"],
        })
        .pipe(
          Effect.map(() => true),
          Effect.orElseSucceed(() => false),
        );
      if (!hasCommits) {
        const details = yield* git.statusDetails(input.cwd).pipe(Effect.orElseSucceed(() => null));
        return {
          repository: toRepositoryInfo(providerKind, urls),
          remoteName,
          remoteUrl,
          branch: details?.branch ?? "main",
          status: "remote_added" as const,
        };
      }

      const pushResult = yield* git.pushCurrentBranch(input.cwd, null, { remoteName });

      return {
        repository: toRepositoryInfo(providerKind, urls),
        remoteName,
        remoteUrl,
        branch: pushResult.branch,
        ...(pushResult.upstreamBranch ? { upstreamBranch: pushResult.upstreamBranch } : {}),
        status: "pushed" as const,
      };
    },
  );

  return SourceControlRepositoryService.of({
    lookupRepository: (input) =>
      lookupRepository(input).pipe(
        mapRepositoryError("lookupRepository", input.provider),
        Effect.tapError((error) =>
          Effect.logWarning("sourceControl.lookupRepository failed", {
            provider: error.provider,
            detail: error.detail,
            repository: input.repository,
          }),
        ),
      ),
    searchRepositories: (input) =>
      searchRepositories(input).pipe(mapRepositoryError("searchRepositories", input.provider)),
    cloneRepository: (input) =>
      cloneRepository(input).pipe(
        mapRepositoryError("cloneRepository", input.provider ?? "unknown"),
        Effect.tapError((error) =>
          Effect.logWarning("sourceControl.cloneRepository failed", {
            provider: error.provider,
            detail: error.detail,
            repository: input.repository ?? input.remoteUrl ?? "",
          }),
        ),
      ),
    publishRepository: (input) =>
      publishRepository(input).pipe(mapRepositoryError("publishRepository", input.provider)),
  });
});

export const layer = Layer.effect(SourceControlRepositoryService, make);
