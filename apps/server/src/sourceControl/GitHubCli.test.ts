import { assert, it, afterEach, describe, expect, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";
import { AuthSessionId, VcsProcessExitError, VcsProcessSpawnError } from "@t3tools/contracts";

import * as Option from "effect/Option";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "./GitHubCli.ts";
import * as GitHubCredentialStore from "./GitHubCredentialStore.ts";
import { GitHubTenant } from "./GitHubTenant.ts";

const processOutput = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

const mockRun = vi.fn<VcsProcess.VcsProcess["Service"]["run"]>();
const TENANT_SESSION = AuthSessionId.make("github-cli-tenant");
const TENANT_TOKEN = "gho_test_tenant_token";

const emptyCredentialStore = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
  get: () => Effect.succeed(Option.none()),
  set: () => Effect.void,
  remove: () => Effect.void,
  createOAuthState: () => Effect.succeed({ state: "unused" }),
  consumeOAuthState: () => Effect.succeed(Option.none()),
});

const layer = GitHubCli.layer.pipe(
  Layer.provide(
    Layer.mock(VcsProcess.VcsProcess)({
      run: mockRun,
    }),
  ),
  Layer.provide(emptyCredentialStore),
);

afterEach(() => {
  mockRun.mockReset();
});

describe("GitHubCli.layer", () => {
  it("parses GitHub owner/repo locators from common inputs", () => {
    assert.deepStrictEqual(GitHubCli.parseGitHubRepositoryLocator("octocat/hello"), {
      owner: "octocat",
      repo: "hello",
    });
    assert.deepStrictEqual(
      GitHubCli.parseGitHubRepositoryLocator("https://github.com/octocat/hello.git"),
      { owner: "octocat", repo: "hello" },
    );
    assert.deepStrictEqual(GitHubCli.parseGitHubRepositoryLocator("github.com/octocat/hello"), {
      owner: "octocat",
      repo: "hello",
    });
  });

  it("does not classify a missing cwd as an unavailable gh executable", () => {
    const context = { command: "gh", cwd: "/repo" } as const;
    const missingCwd = new VcsProcessSpawnError({
      operation: "GitHubCli.execute",
      command: "gh",
      cwd: context.cwd,
      cause: PlatformError.systemError({
        _tag: "NotFound",
        module: "FileSystem",
        method: "access",
        pathOrDescriptor: context.cwd,
      }),
    });

    const commandFailure = GitHubCli.fromVcsError(context, missingCwd);

    assert.equal(commandFailure._tag, "GitHubCliCommandError");
    assert.strictEqual(commandFailure.cause, missingCwd);
    assert.notProperty(commandFailure, "operation");
  });

  it.effect("parses pull request view output", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              number: 42,
              title: "Add PR thread creation",
              url: "https://github.com/pingdotgg/codething-mvp/pull/42",
              baseRefName: "main",
              headRefName: "feature/pr-threads",
              state: "OPEN",
              mergedAt: null,
              isCrossRepository: true,
              headRepository: {
                nameWithOwner: "octocat/codething-mvp",
              },
              headRepositoryOwner: {
                login: "octocat",
              },
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getPullRequest({
        cwd: "/repo",
        reference: "#42",
      });

      assert.deepStrictEqual(result, {
        number: 42,
        title: "Add PR thread creation",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseRefName: "main",
        headRefName: "feature/pr-threads",
        state: "open",
        isCrossRepository: true,
        headRepositoryNameWithOwner: "octocat/codething-mvp",
        headRepositoryOwnerLogin: "octocat",
      });
      expect(mockRun).toHaveBeenCalledWith({
        operation: "GitHubCli.execute",
        command: "gh",
        args: [
          "pr",
          "view",
          "#42",
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("trims pull request fields decoded from gh json", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              number: 42,
              title: "  Add PR thread creation  \n",
              url: " https://github.com/pingdotgg/codething-mvp/pull/42 ",
              baseRefName: " main ",
              headRefName: "\tfeature/pr-threads\t",
              state: "OPEN",
              mergedAt: null,
              isCrossRepository: true,
              headRepository: {
                nameWithOwner: " octocat/codething-mvp ",
              },
              headRepositoryOwner: {
                login: " octocat ",
              },
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getPullRequest({
        cwd: "/repo",
        reference: "#42",
      });

      assert.deepStrictEqual(result, {
        number: 42,
        title: "Add PR thread creation",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseRefName: "main",
        headRefName: "feature/pr-threads",
        state: "open",
        isCrossRepository: true,
        headRepositoryNameWithOwner: "octocat/codething-mvp",
        headRepositoryOwnerLogin: "octocat",
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("skips invalid entries when parsing pr lists", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify([
              {
                number: 0,
                title: "invalid",
                url: "https://github.com/pingdotgg/codething-mvp/pull/0",
                baseRefName: "main",
                headRefName: "feature/invalid",
              },
              {
                number: 43,
                title: "  Valid PR  ",
                url: " https://github.com/pingdotgg/codething-mvp/pull/43 ",
                baseRefName: " main ",
                headRefName: " feature/pr-list ",
                headRepository: {
                  nameWithOwner: "   ",
                },
                headRepositoryOwner: {
                  login: "   ",
                },
              },
            ]),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.listOpenPullRequests({
        cwd: "/repo",
        headSelector: "feature/pr-list",
      });

      assert.deepStrictEqual(result, [
        {
          number: 43,
          title: "Valid PR",
          url: "https://github.com/pingdotgg/codething-mvp/pull/43",
          baseRefName: "main",
          headRefName: "feature/pr-list",
          state: "open",
        },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("keeps pull requests from gh versions without headRepository.nameWithOwner", () =>
    // gh < 2.47 (e.g. Ubuntu-packaged 2.46) exports headRepository as
    // {id, name} only. These entries must decode instead of being dropped,
    // with nameWithOwner rebuilt from the owner login.
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify([
              {
                number: 2829,
                title: "Codex turn mapping",
                url: "https://github.com/pingdotgg/codething-mvp/pull/2829",
                baseRefName: "main",
                headRefName: "t3code/codex-turn-mapping",
                state: "OPEN",
                mergedAt: null,
                isCrossRepository: false,
                headRepository: {
                  id: "R_kgDORLtfbQ",
                  name: "codething-mvp",
                },
                headRepositoryOwner: {
                  id: "MDEyOk9yZ2FuaXphdGlvbjg5MTkxNzI3",
                  login: "pingdotgg",
                },
              },
            ]),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.listOpenPullRequests({
        cwd: "/repo",
        headSelector: "t3code/codex-turn-mapping",
      });

      assert.deepStrictEqual(result, [
        {
          number: 2829,
          title: "Codex turn mapping",
          url: "https://github.com/pingdotgg/codething-mvp/pull/2829",
          baseRefName: "main",
          headRefName: "t3code/codex-turn-mapping",
          state: "open",
          isCrossRepository: false,
          headRepositoryNameWithOwner: "pingdotgg/codething-mvp",
          headRepositoryOwnerLogin: "pingdotgg",
        },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("reads repository clone URLs", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              nameWithOwner: "octocat/codething-mvp",
              url: "https://github.com/octocat/codething-mvp",
              sshUrl: "git@github.com:octocat/codething-mvp.git",
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getRepositoryCloneUrls({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("looks up repositories over the GitHub API when a tenant token is present", () => {
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json({
        id: 1,
        full_name: "octocat/codething-mvp",
        html_url: "https://github.com/octocat/codething-mvp",
        private: true,
        owner: { login: "octocat" },
      });
    }) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "repo",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getRepositoryCloneUrls({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
      assert.deepStrictEqual(requested, ["https://api.github.com/repos/octocat/codething-mvp"]);
      expect(mockRun).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("accepts GitHub repository JSON that omits or nulls clone URL fields", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        id: 1,
        full_name: "octocat/codething-mvp",
        html_url: null,
        clone_url: null,
        ssh_url: null,
        private: true,
        owner: { login: "octocat" },
      })) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getRepositoryCloneUrls({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("searches repositories over the GitHub API when a tenant token is present", () => {
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json({
        items: [
          {
            full_name: "octocat/codething-mvp",
            html_url: "https://github.com/octocat/codething-mvp",
          },
          {
            full_name: "octocat/codething-mvp-old",
            clone_url: "https://github.com/octocat/codething-mvp-old.git",
          },
        ],
      });
    }) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.searchRepositories({
        cwd: "/repo",
        query: "codething",
        limit: 5,
      });

      assert.deepStrictEqual(result, [
        {
          nameWithOwner: "octocat/codething-mvp",
          url: "https://github.com/octocat/codething-mvp",
          sshUrl: "git@github.com:octocat/codething-mvp.git",
        },
        {
          nameWithOwner: "octocat/codething-mvp-old",
          url: "https://github.com/octocat/codething-mvp-old",
          sshUrl: "git@github.com:octocat/codething-mvp-old.git",
        },
      ]);
      assert.equal(requested.length, 1);
      assert.include(requested[0], "search/repositories?q=");
      assert.include(decodeURIComponent(requested[0]!), "user:octocat");
      assert.include(requested[0], "codething");
      expect(mockRun).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("lists recently updated repositories when the search query is empty", () => {
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json([
        {
          full_name: "octocat/recent-project",
          html_url: "https://github.com/octocat/recent-project",
        },
      ]);
    }) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.searchRepositories({
        cwd: "/repo",
        query: "",
        limit: 10,
      });

      assert.deepStrictEqual(result, [
        {
          nameWithOwner: "octocat/recent-project",
          url: "https://github.com/octocat/recent-project",
          sshUrl: "git@github.com:octocat/recent-project.git",
        },
      ]);
      assert.equal(requested.length, 1);
      assert.include(requested[0], "/user/repos?");
      assert.include(requested[0], "sort=updated");
      assert.include(requested[0], "affiliation=owner");
      expect(mockRun).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("can search all of GitHub when owner-only is disabled", () => {
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json({ items: [] });
    }) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      yield* gh.searchRepositories({
        cwd: "/repo",
        query: "codething",
        ownerOnly: false,
      });

      assert.equal(requested.length, 1);
      assert.notInclude(decodeURIComponent(requested[0]!), "user:octocat");
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("surfaces an invalid-reference error for partial repository names", () => {
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "type",
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "GitHubRepositoryInvalidReferenceError");
      assert.include(error.detail, "owner/repo");
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
    );
  });

  it.effect("surfaces not-found when GitHub repository lookup returns HTTP 404", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })) as typeof fetch;
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });

    return Effect.gen(function* () {
      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "octocat/missing",
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "GitHubRepositoryNotFoundError");
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );
  });

  it.effect("creates repositories and parses clone URLs from create output", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            "✓ Created repository octocat/codething-mvp on github.com\nhttps://github.com/octocat/codething-mvp\n",
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.createRepository({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
        visibility: "private",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenNthCalledWith(1, {
        operation: "GitHubCli.execute",
        command: "gh",
        args: ["repo", "create", "octocat/codething-mvp", "--private"],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("falls back to constructed URLs when create output omits a URL", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(Effect.succeed(processOutput("")));

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.createRepository({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
        visibility: "private",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("surfaces a friendly error when the pull request is not found", () =>
    Effect.gen(function* () {
      const cause = new VcsProcessExitError({
        operation: "GitHubCli.execute",
        command: "gh pr view",
        cwd: "/repo",
        exitCode: 1,
        failureKind: "not-found",
        detail:
          "GraphQL: Could not resolve to a PullRequest with the number of 4888. (repository.pullRequest)",
      });
      mockRun.mockReturnValueOnce(Effect.fail(cause));

      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .getPullRequest({
          cwd: "/repo",
          reference: "4888",
        })
        .pipe(Effect.flip);

      assert.equal(error.message.includes("Pull request not found"), true);
      assert.strictEqual(error._tag, "GitHubPullRequestNotFoundError");
      assert.strictEqual(error.command, "gh");
      assert.strictEqual(error.cwd, "/repo");
      assert.strictEqual(error.cause, cause);
      assert.equal(error.message.includes(cause.detail), false);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("surfaces an actionable rate-limit error without exposing provider stderr", () =>
    Effect.gen(function* () {
      const cause = new VcsProcessExitError({
        operation: "GitHubCli.execute",
        command: "gh",
        cwd: "/repo",
        exitCode: 1,
        failureKind: "rate-limited",
        detail: "API rate limit exceeded.",
        stderrLength: 82,
        stderrTruncated: false,
      });
      mockRun.mockReturnValueOnce(Effect.fail(cause));

      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .listOpenPullRequests({
          cwd: "/repo",
          headSelector: "feature/rate-limited",
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "GitHubCliRateLimitError");
      assert.include(error.detail, "GitHub API rate limit exceeded");
      assert.include(error.detail, "gh api rate_limit");
      assert.strictEqual(error.cause, cause);
      assert.notInclude(error.message, "user ID");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("injects the tenant token through GH_TOKEN and never argv", () => {
    const store = Layer.mock(GitHubCredentialStore.GitHubCredentialStore)({
      get: (sessionId) =>
        Effect.succeed(
          sessionId === TENANT_SESSION
            ? Option.some({
                version: 1 as const,
                sessionId: TENANT_SESSION,
                token: TENANT_TOKEN,
                tokenType: "bearer",
                scope: "repo",
                account: "octocat",
                host: "github.com",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              })
            : Option.none(),
        ),
      set: () => Effect.void,
      remove: () => Effect.void,
      createOAuthState: () => Effect.succeed({ state: "unused" }),
      consumeOAuthState: () => Effect.succeed(Option.none()),
    });
    return Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(processOutput("https://github.com/octocat/hello-world\n")),
      );
      const gh = yield* GitHubCli.GitHubCli;
      yield* gh.getDefaultBranch({ cwd: "/repo" });
      expect(mockRun).toHaveBeenCalledWith({
        operation: "GitHubCli.execute",
        command: "gh",
        args: ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
        cwd: "/repo",
        timeoutMs: 30_000,
        env: {
          GH_TOKEN: TENANT_TOKEN,
          GH_HOST: "github.com",
        },
      });
      expect(mockRun.mock.calls[0]?.[0].args.join(" ")).not.toContain(TENANT_TOKEN);
    }).pipe(
      Effect.provideService(GitHubTenant, { sessionId: TENANT_SESSION }),
      Effect.provide(
        GitHubCli.layer.pipe(
          Layer.provide(
            Layer.mock(VcsProcess.VcsProcess)({
              run: mockRun,
            }),
          ),
          Layer.provide(store),
        ),
      ),
    );
  });
});
