import * as Cache from "effect/Cache"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Octokit } from "octokit"
import { createAppAuth } from "@octokit/auth-app"
import { graphql as graphqlRequest } from "@octokit/graphql"
import {
  BranchExists,
  BranchListResponse,
  BranchProtected,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GithubRepo,
  GithubRepoPage,
  RateLimited,
  RepoGone
} from "@projectproject/shared"
import { BetterAuth } from "../Services/BetterAuth"
import {
  GitHub,
  type GitHubInstallationAccount,
  type GitHubShape,
  type RawBranchEntry,
  type RawProjectStates,
  type VerifiedInstallationRepo
} from "../Services/GitHub"

type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | BranchExists
  | BranchProtected
  | RateLimited
  | GitHubError

const HTTP_STATUS_KEY = "status"

function mapHttpError(cause: unknown, nowSeconds: number): GitHubFailure {
  const err = cause as Record<string, unknown> | undefined
  const status = err?.[HTTP_STATUS_KEY] as number | undefined
  const message =
    typeof err?.message === "string" ? err.message : "GitHub error"
  const headers = (
    err?.["response"] as { headers?: Record<string, string> } | undefined
  )?.headers
  const resetHeader =
    headers?.["x-ratelimit-reset"] ?? headers?.["X-RateLimit-Reset"]

  if (status === 401) return new GitHubTokenExpired()
  if (status === 403) {
    if (/rate.?limit|abuse/i.test(message)) {
      return new RateLimited({
        resetAt: resetHeader ? Number(resetHeader) : nowSeconds + 60
      })
    }
    return new GitHubScopeInsufficient()
  }
  if (status === 404) return new RepoGone()
  if (status === 422) {
    if (/already exists/i.test(message)) {
      return new BranchExists({ branch: "" })
    }
    if (/protected/i.test(message)) {
      return new BranchProtected({ branch: "" })
    }
    return new GitHubError({ message })
  }
  if (status === 429) {
    return new RateLimited({
      resetAt: resetHeader ? Number(resetHeader) : nowSeconds + 60
    })
  }
  return new GitHubError({ message })
}

const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((ms) => Math.floor(ms / 1000))
)

const octokitFor = (token: string) => new Octokit({ auth: token })
const graphqlFor = (token: string) =>
  graphqlRequest.defaults({ headers: { authorization: `token ${token}` } })

type TaggedFailure = { readonly _tag: string }

const narrow =
  <const Allow extends ReadonlyArray<GitHubFailure["_tag"]>>(allow: Allow) =>
  (
    cause: unknown,
    nowSecs: number
  ): Extract<GitHubFailure, { _tag: Allow[number] }> | GitHubError => {
    const err = mapHttpError(cause, nowSecs)
    if ((allow as ReadonlyArray<string>).includes(err._tag)) {
      return err as Extract<GitHubFailure, { _tag: Allow[number] }>
    }
    return new GitHubError({ message: err._tag })
  }

type GitHubRequestAttributes = Record<string, unknown> & {
  readonly tokenSource: "user" | "installation"
  readonly operation: string
}

const githubRequest = <A, EOut extends TaggedFailure>(
  attributes: GitHubRequestAttributes,
  fn: (signal: AbortSignal) => Promise<A>,
  narrowErr: (cause: unknown, now: number) => EOut
): Effect.Effect<A, EOut> =>
  Effect.gen(function* () {
    const now = yield* nowSeconds
    return yield* Effect.tryPromise({
      try: fn,
      catch: (cause) => narrowErr(cause, now)
    })
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("github request failed").pipe(
        Effect.annotateLogs({ error: error._tag })
      )
    ),
    Effect.withSpan(`GitHub.${attributes.operation}`, { attributes }),
    Effect.annotateLogs({ module: "GitHub", ...attributes })
  )

const FETCH_PROJECT_STATES_QUERY = /* GraphQL */ `
  query FetchProjectStates($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        name
      }
      refs(refPrefix: "refs/heads/", first: 100) {
        nodes {
          name
        }
      }
      pullRequests(
        states: [OPEN, MERGED, CLOSED]
        first: 100
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          number
          title
          url
          state
          isDraft
          headRefName
          baseRefName
          mergedAt
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  }
`

const LIST_BRANCHES_QUERY = /* GraphQL */ `
  query ListBranches($owner: String!, $name: String!, $q: String, $first: Int!) {
    repository(owner: $owner, name: $name) {
      refs(
        refPrefix: "refs/heads/"
        query: $q
        first: $first
        orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
      ) {
        nodes {
          name
          branchProtectionRule {
            id
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
`

const BRANCH_EXISTS_QUERY = /* GraphQL */ `
  query BranchExists($owner: String!, $name: String!, $ref: String!) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $ref) {
        name
      }
    }
  }
`

interface FetchProjectStatesResponse {
  readonly repository: {
    readonly defaultBranchRef: { readonly name: string } | null
    readonly refs: { readonly nodes: ReadonlyArray<{ readonly name: string }> }
    readonly pullRequests: {
      readonly nodes: ReadonlyArray<{
        readonly number: number
        readonly title: string
        readonly url: string
        readonly state: "OPEN" | "CLOSED" | "MERGED"
        readonly isDraft: boolean
        readonly headRefName: string
        readonly baseRefName: string
        readonly mergedAt: string | null
        readonly commits: {
          readonly nodes: ReadonlyArray<{
            readonly commit: {
              readonly statusCheckRollup: { readonly state: string } | null
            }
          }>
        }
      }>
    }
  } | null
}

interface ListBranchesResponse {
  readonly repository: {
    readonly refs: {
      readonly nodes: ReadonlyArray<{
        readonly name: string
        readonly branchProtectionRule: { readonly id: string } | null
      }>
      readonly pageInfo: { readonly hasNextPage: boolean }
    }
  } | null
}

interface BranchExistsResponse {
  readonly repository: {
    readonly ref: { readonly name: string } | null
  } | null
}

const mapChecks = (
  s: string | null | undefined
): RawBranchEntry["checks"] => {
  if (!s) return "none"
  if (s === "SUCCESS") return "passing"
  if (s === "FAILURE" || s === "ERROR") return "failing"
  if (s === "PENDING" || s === "EXPECTED") return "pending"
  return "neutral"
}

const projectStatesFromResponse = (
  data: FetchProjectStatesResponse
): RawProjectStates | null => {
  if (!data.repository) return null
  const existingBranches = new Set(
    data.repository.refs.nodes.map((r) => r.name)
  )
  const prByBranch = new Map<string, RawBranchEntry>()
  for (const pr of data.repository.pullRequests.nodes) {
    if (prByBranch.has(pr.headRefName)) continue
    prByBranch.set(pr.headRefName, {
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      state:
        pr.state === "MERGED"
          ? "merged"
          : pr.state === "CLOSED"
            ? "closed"
            : "open",
      draft: pr.isDraft,
      number: pr.number,
      url: pr.url,
      title: pr.title,
      mergedAt: pr.mergedAt
        ? DateTime.toDate(DateTime.unsafeMake(pr.mergedAt))
        : null,
      checks: mapChecks(pr.commits.nodes[0]?.commit.statusCheckRollup?.state)
    })
  }
  return {
    defaultBranch: data.repository.defaultBranchRef?.name ?? "main",
    existingBranches,
    prByBranch
  }
}

const branchListFromResponse = (
  data: ListBranchesResponse
): BranchListResponse | null => {
  if (!data.repository) return null
  return {
    items: data.repository.refs.nodes.map((n) => ({
      name: n.name,
      isProtected: n.branchProtectionRule !== null
    })),
    hasMore: data.repository.refs.pageInfo.hasNextPage
  }
}

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

    const normalizePrivateKey = (raw: string): string => {
      const normalized = raw.replace(/\\n/g, "\n")
      if (normalized.includes("BEGIN")) return normalized
      return Buffer.from(normalized, "base64").toString("utf8")
    }

    const appAuth = (): Effect.Effect<
      ReturnType<typeof createAppAuth>,
      GitHubError
    > =>
      Effect.gen(function* () {
        const appId = yield* Config.string("GITHUB_APP_ID")
        const privateKey = yield* Config.redacted("GITHUB_APP_PRIVATE_KEY")
        const clientId = yield* Config.string("GITHUB_APP_CLIENT_ID")
        const clientSecret = yield* Config.redacted("GITHUB_APP_CLIENT_SECRET")
        return yield* Effect.try({
          try: () =>
            createAppAuth({
              appId,
              privateKey: normalizePrivateKey(Redacted.value(privateKey)),
              clientId,
              clientSecret: Redacted.value(clientSecret)
            }),
          catch: (cause) => new GitHubError({ message: String(cause) })
        })
      }).pipe(
        Effect.catchAll((cause) =>
          cause._tag === "GitHubError"
            ? Effect.fail(cause)
            : Effect.fail(
                new GitHubError({
                  message: "missing GitHub App configuration"
                })
              )
        )
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

    const fetchProjectStatesWithToken = (
      token: string,
      owner: string,
      name: string,
      tokenSource: "user" | "installation"
    ): Effect.Effect<RawProjectStates, RepoGone | RateLimited | GitHubError> =>
      Effect.gen(function* () {
        const gql = graphqlFor(token)
        const data = yield* githubRequest(
          {
            tokenSource,
            operation: "fetchProjectStates",
            repoOwner: owner,
            repoName: name
          },
          (signal) =>
            gql<FetchProjectStatesResponse>(FETCH_PROJECT_STATES_QUERY, {
              owner,
              name,
              request: { signal }
            }),
          narrow(["RepoGone", "RateLimited"] as const)
        )
        const result = projectStatesFromResponse(data)
        if (!result) return yield* new RepoGone()
        return result
      })

    const listBranchesWithToken = (
      token: string,
      owner: string,
      name: string,
      query: string | undefined,
      first: number,
      tokenSource: "user" | "installation"
    ): Effect.Effect<
      BranchListResponse,
      RepoGone | RateLimited | GitHubError
    > =>
      Effect.gen(function* () {
        const gql = graphqlFor(token)
        const data = yield* githubRequest(
          {
            tokenSource,
            operation: "listBranches",
            repoOwner: owner,
            repoName: name,
            query: query ?? null,
            first
          },
          (signal) =>
            gql<ListBranchesResponse>(LIST_BRANCHES_QUERY, {
              owner,
              name,
              q: query ?? null,
              first,
              request: { signal }
            }),
          narrow(["RepoGone", "RateLimited"] as const)
        )
        const result = branchListFromResponse(data)
        if (!result) return yield* new RepoGone()
        return result
      })

    const branchExistsWithToken = (
      token: string,
      owner: string,
      name: string,
      branch: string,
      tokenSource: "user" | "installation"
    ): Effect.Effect<boolean, RepoGone | RateLimited | GitHubError> =>
      Effect.gen(function* () {
        const gql = graphqlFor(token)
        const data = yield* githubRequest(
          {
            tokenSource,
            operation: "branchExists",
            repoOwner: owner,
            repoName: name,
            branch
          },
          (signal) =>
            gql<BranchExistsResponse>(BRANCH_EXISTS_QUERY, {
              owner,
              name,
              ref: `refs/heads/${branch}`,
              request: { signal }
            }),
          narrow(["RepoGone", "RateLimited"] as const)
        )
        if (!data.repository) return yield* new RepoGone()
        return data.repository.ref !== null
      })

    const listUserRepos = Effect.fn("GitHub.listUserRepos")(function* (
      userId: string,
      query: string | undefined,
      page: number
    ) {
      const token = yield* tokenFor(userId)
      const octokit = octokitFor(token)
      const perPage = 30
      const result = yield* githubRequest(
        {
          tokenSource: "user",
          operation: "listUserRepos",
          userId,
          query: query ?? null,
          page
        },
        async (signal) => {
          if (query && query.trim()) {
            const me = await octokit.rest.users.getAuthenticated({
              request: { signal }
            })
            const res = await octokit.rest.search.repos({
              q: `${query} user:${me.data.login} fork:true`,
              per_page: perPage,
              page,
              request: { signal }
            })
            return {
              items: res.data.items.map((r) => ({
                id: String(r.id),
                owner: r.owner?.login ?? "",
                name: r.name,
                defaultBranch: r.default_branch,
                private: r.private,
                description: r.description ?? null
              })),
              hasMore: res.data.items.length === perPage
            }
          }
          const res = await octokit.rest.repos.listForAuthenticatedUser({
            per_page: perPage,
            page,
            sort: "pushed",
            affiliation: "owner,collaborator,organization_member",
            request: { signal }
          })
          return {
            items: res.data.map((r) => ({
              id: String(r.id),
              owner: r.owner.login,
              name: r.name,
              defaultBranch: r.default_branch,
              private: r.private,
              description: r.description ?? null
            })),
            hasMore: res.data.length === perPage
          }
        },
        narrow(["GitHubTokenExpired", "GitHubScopeInsufficient"] as const)
      )
      return {
        repos: result.items.map((r) => GithubRepo.make(r)),
        hasMore: result.hasMore
      }
    })

    const verifyAccess = Effect.fn("GitHub.verifyAccess")(function* (
      owner: string,
      name: string,
      userId: string
    ) {
      const token = yield* tokenFor(userId)
      const octokit = octokitFor(token)
      const data = yield* githubRequest(
        {
          tokenSource: "user",
          operation: "verifyAccess",
          userId,
          repoOwner: owner,
          repoName: name
        },
        (signal) =>
          octokit.rest.repos.get({ owner, repo: name, request: { signal } }),
        narrow([
          "GitHubTokenExpired",
          "GitHubScopeInsufficient",
          "RepoGone"
        ] as const)
      )
      if (data.data.permissions && !data.data.permissions.push) {
        return yield* new GitHubScopeInsufficient()
      }
      return { defaultBranch: data.data.default_branch }
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
            message:
              typeof (cause as { message?: unknown }).message === "string"
                ? String((cause as { message: string }).message)
                : "GitHub error"
          })
      )
      return response.data.installations.some(
        (installation) => String(installation.id) === installationId
      )
    })

    const createBranch = Effect.fn("GitHub.createBranch")(function* (
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
        { ...ctx, operation: "createBranch.getBranch" },
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
        { ...ctx, operation: "createBranch.createRef" },
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
    })

    const openPullRequest = Effect.fn("GitHub.openPullRequest")(function* (
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
          operation: "openPullRequest",
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
    })

    const fetchProjectStates = Effect.fn("GitHub.fetchProjectStates")(
      function* (owner: string, name: string, userId: string) {
        const token = yield* tokenFor(userId)
        return yield* fetchProjectStatesWithToken(token, owner, name, "user")
      }
    )

    const listBranches = Effect.fn("GitHub.listBranches")(function* (
      owner: string,
      name: string,
      query: string | undefined,
      first: number,
      userId: string
    ) {
      const token = yield* tokenFor(userId)
      return yield* listBranchesWithToken(
        token,
        owner,
        name,
        query,
        first,
        "user"
      )
    })

    const branchExists = Effect.fn("GitHub.branchExists")(function* (
      owner: string,
      name: string,
      branch: string,
      userId: string
    ) {
      const token = yield* tokenFor(userId)
      return yield* branchExistsWithToken(token, owner, name, branch, "user")
    })

    const fetchInstallationProjectStates = Effect.fn(
      "GitHub.fetchInstallationProjectStates"
    )(function* (installationId: string, owner: string, name: string) {
      const token = yield* installationTokenFor(installationId)
      return yield* fetchProjectStatesWithToken(
        token,
        owner,
        name,
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
      listUserRepos,
      verifyAccess,
      getInstallationAccount,
      listInstallationRepos,
      verifyInstallationRepo,
      exchangeAppUserCode,
      appUserCanAccessInstallation,
      createBranch,
      openPullRequest,
      fetchProjectStates,
      fetchInstallationProjectStates,
      listBranches,
      listInstallationBranches,
      branchExists,
      branchExistsInstallation
    } satisfies GitHubShape
  })
)
