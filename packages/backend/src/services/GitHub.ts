// GitHub service — wraps Octokit for the git-connection feature.
//
// Every method takes a `userId`, fetches that user's GitHub OAuth token from
// Better Auth, builds a per-call Octokit instance, then maps Octokit failures
// to wire-side tagged errors. Per-call clients are fine at PoC scale; if we
// ever care about TCP reuse we can pool clients keyed by userId.
//
// SHAPE OF THE SERVICE
// ----------------------------------------------------------------------------
//   - listUserRepos         — picker source
//   - verifyAccess          — call before persisting a connection
//   - getDefaultBranch      — used as the create-branch base default
//   - createBranch          — new ref from a base SHA
//   - openPullRequest       — POST a PR
//   - fetchProjectStates    — single GraphQL roundtrip for branch + PR state
//                             across N tickets in one repo
//
// ERROR MAPPING
// ----------------------------------------------------------------------------
//   401             → GitHubTokenExpired
//   403 + scope hint→ GitHubScopeInsufficient
//   403 + "abuse" / "secondary rate limit" → RateLimited
//   404 (repo)      → RepoGone
//   404 (ref)       → handled inline (means branch doesn't exist)
//   422 + branch protection → BranchProtected
//   422 (already exists) → BranchExists
//   429             → RateLimited (X-RateLimit-Reset header)
//   anything else   → GitHubError(message)
//
// We pull the GitHub token via `BetterAuth.getGithubAccessToken`. If the token
// row is missing entirely (`NoGithubToken`), we report `GitHubTokenExpired` —
// the user-facing remedy is the same: reconnect via OAuth.

import { Effect } from "effect"
import { Octokit } from "octokit"
import { graphql as graphqlRequest } from "@octokit/graphql"
import {
  BranchExists,
  BranchProtected,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GithubRepo,
  GithubRepoPage,
  RateLimited,
  RepoGone
} from "@projectproject/shared"
import { BetterAuth } from "./BetterAuth"

// Raw shapes returned by `fetchProjectStates`. The Tickets service maps these
// to the wire-side `GitState` union. Keeping the raw shape close to the
// GraphQL response means one source of truth for the parsing.
export interface RawBranchEntry {
  readonly headRefName: string
  readonly baseRefName: string
  readonly state: "open" | "closed" | "merged"
  readonly draft: boolean
  readonly number: number
  readonly url: string
  readonly title: string
  readonly mergedAt: Date | null
  readonly checks: "passing" | "failing" | "pending" | "neutral" | "none"
}

export interface RawProjectStates {
  readonly defaultBranch: string
  readonly existingBranches: ReadonlySet<string>
  // Most-recent PR keyed by head ref name. We pick the latest-updated PR per
  // branch — a branch can have multiple PRs over its lifetime, but the latest
  // is the one the UI cares about.
  readonly prByBranch: ReadonlyMap<string, RawBranchEntry>
}

type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | BranchExists
  | BranchProtected
  | RateLimited
  | GitHubError

const HTTP_STATUS_KEY = "status"

function mapHttpError(cause: unknown): GitHubFailure {
  // Octokit throws RequestError with a numeric `status`. We don't want to
  // depend on its constructor identity, so we duck-type.
  const err = cause as Record<string, unknown> | undefined
  const status = err?.[HTTP_STATUS_KEY] as number | undefined
  const message =
    typeof err?.message === "string" ? (err.message as string) : "GitHub error"
  const headers = (
    err?.["response"] as { headers?: Record<string, string> } | undefined
  )?.headers
  const resetHeader =
    headers?.["x-ratelimit-reset"] ?? headers?.["X-RateLimit-Reset"]

  if (status === 401) return new GitHubTokenExpired()
  if (status === 403) {
    if (/rate.?limit|abuse/i.test(message)) {
      return new RateLimited({
        resetAt: resetHeader
          ? Number(resetHeader)
          : Math.floor(Date.now() / 1000) + 60
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
      resetAt: resetHeader
        ? Number(resetHeader)
        : Math.floor(Date.now() / 1000) + 60
    })
  }
  return new GitHubError({ message })
}

const octokitFor = (token: string) => new Octokit({ auth: token })
const graphqlFor = (token: string) =>
  graphqlRequest.defaults({ headers: { authorization: `token ${token}` } })

export class GitHub extends Effect.Service<GitHub>()("GitHub", {
  effect: Effect.gen(function* () {
    const betterAuth = yield* BetterAuth

    // Fetch token, mapping `NoGithubToken` → `GitHubTokenExpired` for the
    // wire. Anything else from Better Auth is a server-side bug — let it
    // bubble as a defect.
    const tokenFor = (
      userId: string
    ): Effect.Effect<string, GitHubTokenExpired> =>
      betterAuth.getGithubAccessToken(userId).pipe(
        Effect.catchTag("NoGithubToken", () =>
          Effect.fail(new GitHubTokenExpired())
        ),
        Effect.catchTag("BetterAuthError", (e) => Effect.die(e))
      )

    const listUserRepos = (
      userId: string,
      query: string | undefined,
      page: number
    ): Effect.Effect<
      GithubRepoPage,
      GitHubTokenExpired | GitHubScopeInsufficient | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)
        const perPage = 30

        // Free-text search → use the Search API; otherwise list authed
        // user's repos (includes private + collaborator). Different
        // endpoints, same shape mapped to GithubRepo.
        const result = yield* Effect.tryPromise({
          try: async () => {
            if (query && query.trim()) {
              const me = await octokit.rest.users.getAuthenticated()
              const res = await octokit.rest.search.repos({
                q: `${query} user:${me.data.login} fork:true`,
                per_page: perPage,
                page
              })
              return {
                items: res.data.items.map((r) => ({
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
              affiliation: "owner,collaborator,organization_member"
            })
            return {
              items: res.data.map((r) => ({
                owner: r.owner.login,
                name: r.name,
                defaultBranch: r.default_branch,
                private: r.private,
                description: r.description ?? null
              })),
              hasMore: res.data.length === perPage
            }
          },
          catch: mapHttpError
        }).pipe(
          Effect.catchAll((e) =>
            e._tag === "GitHubTokenExpired" ||
            e._tag === "GitHubScopeInsufficient" ||
            e._tag === "GitHubError"
              ? Effect.fail(e)
              : Effect.fail(new GitHubError({ message: String(e) }))
          )
        )
        return {
          repos: result.items.map((r) => GithubRepo.make(r)),
          hasMore: result.hasMore
        }
      })

    const verifyAccess = (
      owner: string,
      name: string,
      userId: string
    ): Effect.Effect<
      { defaultBranch: string },
      GitHubTokenExpired | GitHubScopeInsufficient | RepoGone | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)
        const data = yield* Effect.tryPromise({
          try: () => octokit.rest.repos.get({ owner, repo: name }),
          catch: mapHttpError
        }).pipe(
          Effect.catchAll((e) =>
            e._tag === "GitHubTokenExpired" ||
            e._tag === "GitHubScopeInsufficient" ||
            e._tag === "RepoGone" ||
            e._tag === "GitHubError"
              ? Effect.fail(e)
              : Effect.fail(new GitHubError({ message: String(e) }))
          )
        )
        // We require push access — branch creation needs it. permissions
        // is populated when the token can see the repo at all.
        if (data.data.permissions && !data.data.permissions.push) {
          return yield* Effect.fail(new GitHubScopeInsufficient())
        }
        return { defaultBranch: data.data.default_branch }
      })

    const createBranch = (
      owner: string,
      name: string,
      branchName: string,
      baseBranch: string,
      userId: string
    ): Effect.Effect<
      { name: string; sha: string },
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | BranchExists
      | BranchProtected
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)

        // Fetch the base branch SHA, then create the ref. Two calls; the
        // first fails with NotFound if the base branch is wrong.
        const base = yield* Effect.tryPromise({
          try: () =>
            octokit.rest.repos.getBranch({
              owner,
              repo: name,
              branch: baseBranch
            }),
          catch: mapHttpError
        }).pipe(
          Effect.catchAll((e) =>
            e._tag === "RepoGone"
              ? // 404 here usually means base branch typo, not the whole repo.
                // Map to GitHubError with a helpful message rather than RepoGone.
                Effect.fail(
                  new GitHubError({
                    message: `base branch "${baseBranch}" not found`
                  })
                )
              : Effect.fail(e as GitHubFailure)
          )
        )
        const sha = base.data.commit.sha

        yield* Effect.tryPromise({
          try: () =>
            octokit.rest.git.createRef({
              owner,
              repo: name,
              ref: `refs/heads/${branchName}`,
              sha
            }),
          // mapHttpError doesn't know the branch name; rewrite errors that
          // need it.
          catch: (cause) => {
            const err = mapHttpError(cause)
            if (err._tag === "BranchExists")
              return new BranchExists({ branch: branchName })
            if (err._tag === "BranchProtected")
              return new BranchProtected({ branch: branchName })
            return err
          }
        })

        return { name: branchName, sha }
      })

    const openPullRequest = (
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
    ): Effect.Effect<
      { number: number; url: string },
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | BranchProtected
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const octokit = octokitFor(token)
        const result = yield* Effect.tryPromise({
          try: () =>
            octokit.rest.pulls.create({
              owner,
              repo: name,
              head: args.head,
              base: args.base,
              title: args.title,
              body: args.body,
              draft: args.draft
            }),
          catch: (cause) => {
            const err = mapHttpError(cause)
            // No "BranchExists" mapping for PRs; treat as GitHubError.
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
        })
        return {
          number: result.data.number,
          url: result.data.html_url
        }
      })

    // Single GraphQL query: default branch + recent PRs (any state) + all
    // branches. Caller resolves per-ticket state by looking up the ticket's
    // branch name in the response. PoC scale assumption: ≤100 branches and
    // ≤100 recent PRs covers any solo project. If we outgrow that, paginate.
    const fetchProjectStates = (
      owner: string,
      name: string,
      userId: string
    ): Effect.Effect<
      RawProjectStates,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const gql = graphqlFor(token)

        interface QResult {
          repository: {
            defaultBranchRef: { name: string } | null
            refs: { nodes: ReadonlyArray<{ name: string }> }
            pullRequests: {
              nodes: ReadonlyArray<{
                number: number
                title: string
                url: string
                state: "OPEN" | "CLOSED" | "MERGED"
                isDraft: boolean
                headRefName: string
                baseRefName: string
                mergedAt: string | null
                commits: {
                  nodes: ReadonlyArray<{
                    commit: {
                      statusCheckRollup: { state: string } | null
                    }
                  }>
                }
              }>
            }
          } | null
        }

        const data = yield* Effect.tryPromise({
          try: () =>
            gql<QResult>(
              /* GraphQL */ `
                query Q($owner: String!, $name: String!) {
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
              `,
              { owner, name }
            ),
          catch: (
            cause
          ):
            | GitHubTokenExpired
            | GitHubScopeInsufficient
            | RepoGone
            | RateLimited
            | GitHubError => {
            const err = mapHttpError(cause)
            // Branch-specific failures don't make sense for a read-only
            // GraphQL query — collapse them into GitHubError.
            if (err._tag === "BranchExists" || err._tag === "BranchProtected") {
              return new GitHubError({ message: "unexpected GitHub response" })
            }
            return err
          }
        })

        if (!data.repository) return yield* Effect.fail(new RepoGone())

        const existingBranches = new Set(
          data.repository.refs.nodes.map((r) => r.name)
        )

        // Map check rollup state to our ChecksStatus union. GitHub returns
        // SUCCESS / FAILURE / PENDING / ERROR / EXPECTED. We collapse:
        //   SUCCESS              → passing
        //   FAILURE | ERROR      → failing
        //   PENDING | EXPECTED   → pending
        //   anything else        → neutral
        const mapChecks = (
          s: string | null | undefined
        ): RawBranchEntry["checks"] => {
          if (!s) return "none"
          if (s === "SUCCESS") return "passing"
          if (s === "FAILURE" || s === "ERROR") return "failing"
          if (s === "PENDING" || s === "EXPECTED") return "pending"
          return "neutral"
        }

        const prByBranch = new Map<string, RawBranchEntry>()
        for (const pr of data.repository.pullRequests.nodes) {
          const existing = prByBranch.get(pr.headRefName)
          // Latest first (sorted desc), so first write wins; we skip
          // older PRs for the same branch.
          if (existing) continue
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
            mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
            checks: mapChecks(
              pr.commits.nodes[0]?.commit.statusCheckRollup?.state
            )
          })
        }

        return {
          defaultBranch: data.repository.defaultBranchRef?.name ?? "main",
          existingBranches,
          prByBranch
        }
      })

    return {
      listUserRepos,
      verifyAccess,
      createBranch,
      openPullRequest,
      fetchProjectStates
    } as const
  }),
  dependencies: []
}) {}
