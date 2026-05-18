import * as Cache from "effect/Cache"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  BranchExists,
  BranchProtected,
  GitHubError,
  GitHubTokenExpired,
  GithubRepo,
  GithubRepoPage
} from "@projectproject/shared"
import { BetterAuth } from "../../Services/BetterAuth"
import {
  GitHub,
  type GitHubInstallationAccount,
  type GitHubShape,
  type VerifiedInstallationRepo
} from "../../Services/GitHub"
import { appAuth } from "./appAuth"
import { octokitFor } from "./clients"
import { githubErrorMessage, mapHttpError, narrow } from "./errors"
import {
  branchExistsWithToken,
  fetchProjectStatesWithToken,
  listBranchesWithToken
} from "./projectState"
import { githubRequest } from "./request"

export const GitHubLive = Layer.effect(
  GitHub,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth

    const tokenFor = (
      userId: string
    ): Effect.Effect<string, GitHubTokenExpired> =>
      betterAuth.getGithubAccessToken(userId).pipe(
        Effect.catchTag("NoGithubToken", () =>
          Effect.fail(new GitHubTokenExpired())
        ),
        Effect.catchTag("BetterAuthError", (e) => Effect.die(e))
      )

    const installationTokenCache = yield* Cache.make({
      capacity: 256,
      timeToLive: Duration.minutes(50),
      lookup: (installationId: string) =>
        Effect.gen(function* () {
          const auth = yield* appAuth()
          const result = yield* Effect.tryPromise({
            try: () =>
              auth({
                type: "installation",
                installationId: Number(installationId)
              }),
            catch: (cause) => new GitHubError({ message: String(cause) })
          })
          return result.token
        })
    })

    const installationTokenFor = (
      installationId: string
    ): Effect.Effect<string, GitHubError> =>
      installationTokenCache.get(installationId)

    const appToken = (): Effect.Effect<string, GitHubError> =>
      Effect.gen(function* () {
        const auth = yield* appAuth()
        const result = yield* Effect.tryPromise({
          try: () => auth({ type: "app" }),
          catch: (cause) => new GitHubError({ message: String(cause) })
        })
        return result.token
      })

    const getInstallationAccount = Effect.fn("GitHub.getInstallationAccount")(
      function* (installationId: string) {
        const token = yield* appToken()
        const octokit = octokitFor(token)
        const result = yield* githubRequest(
          {
            tokenSource: "installation",
            operation: "getInstallationAccount",
            installationId
          },
          (signal) =>
            octokit.rest.apps.getInstallation({
              installation_id: Number(installationId),
              request: { signal }
            }),
          narrow(["RepoGone"] as const)
        )
        const account = result.data.account
        if (!account)
          return yield* new GitHubError({ message: "missing account" })
        const accountLogin = "login" in account ? account.login : account.slug
        const accountType =
          "type" in account && account.type === "Organization"
            ? "Organization"
            : "User"
        return {
          installationId,
          accountId: String(account.id),
          accountLogin,
          accountType
        } satisfies GitHubInstallationAccount
      }
    )

    const listInstallationRepos = Effect.fn("GitHub.listInstallationRepos")(
      function* (
        installationId: string,
        query: string | undefined,
        page: number
      ) {
        const token = yield* installationTokenFor(installationId)
        const octokit = octokitFor(token)
        const perPage = 30
        const response = yield* githubRequest(
          {
            tokenSource: "installation",
            operation: "listInstallationRepos",
            installationId,
            query: query ?? null,
            page
          },
          (signal) =>
            octokit.rest.apps.listReposAccessibleToInstallation({
              per_page: perPage,
              page,
              request: { signal }
            }),
          narrow(["RepoGone", "RateLimited"] as const)
        )
        const q = query?.trim().toLowerCase()
        const repos = response.data.repositories
          .filter((r) => {
            if (!q) return true
            return `${r.owner.login}/${r.name}`.toLowerCase().includes(q)
          })
          .map((r) =>
            GithubRepo.make({
              id: String(r.id),
              owner: r.owner.login,
              name: r.name,
              defaultBranch: r.default_branch,
              private: r.private,
              description: r.description ?? null
            })
          )
        return {
          repos,
          hasMore: response.data.repositories.length === perPage
        } satisfies GithubRepoPage
      }
    )

    const verifyInstallationRepo = Effect.fn("GitHub.verifyInstallationRepo")(
      function* (installationId: string, owner: string, name: string) {
        const token = yield* installationTokenFor(installationId)
        const octokit = octokitFor(token)
        const response = yield* githubRequest(
          {
            tokenSource: "installation",
            operation: "verifyInstallationRepo",
            installationId,
            repoOwner: owner,
            repoName: name
          },
          (signal) =>
            octokit.rest.repos.get({ owner, repo: name, request: { signal } }),
          narrow(["RepoGone"] as const)
        )
        return {
          repoId: String(response.data.id),
          owner: response.data.owner.login,
          name: response.data.name,
          defaultBranch: response.data.default_branch
        } satisfies VerifiedInstallationRepo
      }
    )

    const exchangeAppUserCode = Effect.fn("GitHub.exchangeAppUserCode")(
      function* (code: string) {
        const auth = yield* appAuth()
        const result = yield* Effect.tryPromise({
          try: () => auth({ type: "oauth-user", code }),
          catch: (cause) => new GitHubError({ message: String(cause) })
        }).pipe(
          Effect.annotateLogs({
            module: "GitHub",
            operation: "exchangeAppUserCode",
            tokenSource: "user"
          })
        )
        return result.token
      }
    )

    const appUserCanAccessInstallation = Effect.fn(
      "GitHub.appUserCanAccessInstallation"
    )(function* (userAccessToken: string, installationId: string) {
      const octokit = octokitFor(userAccessToken)
      const response = yield* githubRequest(
        {
          tokenSource: "user",
          operation: "appUserCanAccessInstallation",
          installationId
        },
        (signal) =>
          octokit.request("GET /user/installations", {
            per_page: 100,
            request: { signal }
          }),
        (cause) =>
          new GitHubError({
            message: githubErrorMessage(cause)
          })
      )
      return response.data.installations.some(
        (installation) => String(installation.id) === installationId
      )
    })

    const createBranchAsUser = Effect.fn("GitHub.createBranchAsUser")(
      function* (
        owner: string,
        name: string,
        branchName: string,
        baseBranch: string,
        userId: string
      ) {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)
        const ctx = {
          tokenSource: "user" as const,
          userId,
          repoOwner: owner,
          repoName: name,
          branchName,
          baseBranch
        }
        const base = yield* githubRequest(
          { ...ctx, operation: "createBranchAsUser.getBranch" },
          (signal) =>
            octokit.rest.repos.getBranch({
              owner,
              repo: name,
              branch: baseBranch,
              request: { signal }
            }),
          (cause, now) => {
            const err = mapHttpError(cause, now)
            if (err._tag === "RepoGone") {
              return new GitHubError({
                message: `base branch "${baseBranch}" not found`
              })
            }
            return err
          }
        )
        const sha = base.data.commit.sha
        yield* githubRequest(
          { ...ctx, operation: "createBranchAsUser.createRef" },
          (signal) =>
            octokit.rest.git.createRef({
              owner,
              repo: name,
              ref: `refs/heads/${branchName}`,
              sha,
              request: { signal }
            }),
          (cause, now) => {
            const err = mapHttpError(cause, now)
            if (err._tag === "BranchExists")
              return new BranchExists({ branch: branchName })
            if (err._tag === "BranchProtected")
              return new BranchProtected({ branch: branchName })
            return err
          }
        )
        return { name: branchName, sha }
      }
    )

    const openPullRequestAsUser = Effect.fn("GitHub.openPullRequestAsUser")(
      function* (
        owner: string,
        name: string,
        args: {
          head: string
          base: string
          title: string
          body: string
          draft: boolean
        },
        userId: string
      ) {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)
        const result = yield* githubRequest(
          {
            tokenSource: "user",
            operation: "openPullRequestAsUser",
            userId,
            repoOwner: owner,
            repoName: name,
            head: args.head,
            base: args.base,
            draft: args.draft
          },
          (signal) =>
            octokit.rest.pulls.create({
              owner,
              repo: name,
              head: args.head,
              base: args.base,
              title: args.title,
              body: args.body,
              draft: args.draft,
              request: { signal }
            }),
          (cause, now) => {
            const err = mapHttpError(cause, now)
            if (err._tag === "BranchExists") {
              return new GitHubError({
                message: "PR already exists for this branch"
              })
            }
            if (err._tag === "BranchProtected") {
              return new BranchProtected({ branch: args.head })
            }
            return err
          }
        )
        return {
          number: result.data.number,
          url: result.data.html_url
        }
      }
    )

    const fetchInstallationProjectStates = Effect.fn(
      "GitHub.fetchInstallationProjectStates"
    )(function* (
      installationId: string,
      owner: string,
      name: string,
      branches: ReadonlyArray<string>
    ) {
      const token = yield* installationTokenFor(installationId)
      return yield* fetchProjectStatesWithToken(
        token,
        owner,
        name,
        branches,
        "installation"
      )
    })

    const listInstallationBranches = Effect.fn(
      "GitHub.listInstallationBranches"
    )(function* (
      installationId: string,
      owner: string,
      name: string,
      query: string | undefined,
      first: number
    ) {
      const token = yield* installationTokenFor(installationId)
      return yield* listBranchesWithToken(
        token,
        owner,
        name,
        query,
        first,
        "installation"
      )
    })

    const branchExistsInstallation = Effect.fn(
      "GitHub.branchExistsInstallation"
    )(function* (
      installationId: string,
      owner: string,
      name: string,
      branch: string
    ) {
      const token = yield* installationTokenFor(installationId)
      return yield* branchExistsWithToken(
        token,
        owner,
        name,
        branch,
        "installation"
      )
    })

    return {
      getInstallationAccount,
      listInstallationRepos,
      verifyInstallationRepo,
      exchangeAppUserCode,
      appUserCanAccessInstallation,
      createBranchAsUser,
      openPullRequestAsUser,
      fetchInstallationProjectStates,
      listInstallationBranches,
      branchExistsInstallation
    } satisfies GitHubShape
  })
)
