import { it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"
import {
  NotFound,
  ProjectKey,
  TicketId,
  type GitStatesResponse,
  type TicketDetail
} from "@projectproject/shared"
import {
  BetterAuth,
  NoGithubToken,
  type BetterAuthShape
} from "../Services/BetterAuth"
import { GitHub, type GitHubShape } from "../Services/GitHub"
import type { RawReviewPullRequest } from "../Services/GitHub"
import { Projects, type ProjectsShape } from "../Services/Projects"
import { Reviews } from "../Services/Reviews"
import { Tickets, type TicketsShape } from "../Services/Tickets"
import { ReviewsLive } from "./Reviews"

const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))
const ticketId = Schema.decodeUnknownSync(TicketId)
const projectKey = Schema.decodeUnknownSync(ProjectKey)

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

const ticket = (overrides: Partial<TicketDetail> = {}): TicketDetail => ({
  id: ticketId("T-1"),
  title: "Review backend service",
  status: "in_progress",
  type: "feat",
  priority: "med",
  tags: [],
  branch: "feat/T-1-review",
  pr: 42,
  lastTransitionedPr: null,
  gitState: {
    tag: "pr_open",
    branch: "feat/T-1-review",
    baseBranch: "main",
    number: 42,
    url: "https://github.test/pr/42",
    draft: false,
    title: "Add review backend",
    checks: "passing"
  },
  assignees: ["user-1"],
  createdBy: "user-1",
  createdAt: isoDate("2026-05-20T08:00:00.000Z"),
  updatedAt: isoDate("2026-05-20T09:00:00.000Z"),
  body: "# Review backend service",
  ...overrides
})

const rawPr = (
  overrides: Partial<RawReviewPullRequest> = {}
): RawReviewPullRequest => ({
  id: "42",
  nodeId: "PR_kwDO42",
  number: 42,
  title: "Add review backend",
  body: "Ready for review",
  state: "open" as const,
  draft: false,
  merged: false,
  mergeable: true,
  htmlUrl: "https://github.test/acme/app/pull/42",
  author: {
    login: "octocat",
    avatarUrl: null,
    url: "https://github.test/octocat"
  },
  base: {
    label: "acme:main",
    ref: "main",
    sha: "base-sha",
    repoOwner: "acme",
    repoName: "app"
  },
  head: {
    label: "acme:feat/T-1-review",
    ref: "feat/T-1-review",
    sha: "head-sha",
    repoOwner: "acme",
    repoName: "app"
  },
  counts: {
    commits: 2,
    filesChanged: 1,
    additions: 10,
    deletions: 2,
    comments: 1,
    reviewComments: 1
  },
  checks: {
    status: "none",
    totalCount: 0,
    completedCount: 0
  },
  reviewers: [
    {
      actor: {
        login: "reviewer",
        avatarUrl: null,
        url: "https://github.test/reviewer"
      },
      requested: true,
      decision: "pending"
    }
  ],
  mergeMethods: {
    allowed: ["squash", "merge"],
    defaultMethod: "squash"
  },
  createdAt: isoDate("2026-05-20T08:30:00.000Z"),
  updatedAt: isoDate("2026-05-20T09:30:00.000Z"),
  closedAt: null,
  mergedAt: null,
  ...overrides
})

function makeProjects(overrides: Partial<ProjectsShape> = {}) {
  return Layer.succeed(Projects, {
    list: () => unexpected("Projects.list"),
    listPaged: () => unexpected("Projects.listPaged"),
    listMembersPaged: () => unexpected("Projects.listMembersPaged"),
    create: () => unexpected("Projects.create"),
    get: () => unexpected("Projects.get"),
    getKey: () => Effect.succeed(projectKey("T")),
    getGithubIntegration: () =>
      Effect.succeed({
        installationId: "123",
        repoId: "repo-1",
        repoOwner: "acme",
        repoName: "app",
        defaultBaseBranch: "main"
      }),
    update: () => unexpected("Projects.update"),
    updateSetup: () => unexpected("Projects.updateSetup"),
    remove: () => unexpected("Projects.remove"),
    requireMember: () => Effect.succeed({ role: "member" as const }),
    requireRole: () => unexpected("Projects.requireRole"),
    addMember: () => unexpected("Projects.addMember"),
    updateMember: () => unexpected("Projects.updateMember"),
    transferOwnership: () => unexpected("Projects.transferOwnership"),
    removeMember: () => unexpected("Projects.removeMember"),
    cancelPendingMember: () => unexpected("Projects.cancelPendingMember"),
    unassignUserFromActiveTickets: () =>
      unexpected("Projects.unassignUserFromActiveTickets"),
    connectGithub: () => unexpected("Projects.connectGithub"),
    disconnectGithub: () => unexpected("Projects.disconnectGithub"),
    ...overrides
  } satisfies ProjectsShape)
}

function makeTickets(overrides: Partial<TicketsShape> = {}) {
  return Layer.succeed(Tickets, {
    list: () => unexpected("Tickets.list"),
    count: () => unexpected("Tickets.count"),
    search: () => unexpected("Tickets.search"),
    listInGroup: () => unexpected("Tickets.listInGroup"),
    tagUsageCounts: () => unexpected("Tickets.tagUsageCounts"),
    get: () => unexpected("Tickets.get"),
    findByPrNumber: () => Effect.succeed(ticket()),
    quickCreate: () => unexpected("Tickets.quickCreate"),
    create: () => unexpected("Tickets.create"),
    update: () => unexpected("Tickets.update"),
    remove: () => unexpected("Tickets.remove"),
    replaceTag: () => unexpected("Tickets.replaceTag"),
    createBranch: () => unexpected("Tickets.createBranch"),
    attachBranch: () => unexpected("Tickets.attachBranch"),
    openPr: () => unexpected("Tickets.openPr"),
    clearBranch: () => unexpected("Tickets.clearBranch"),
    getGitState: () => unexpected("Tickets.getGitState"),
    listGitStates: () =>
      Effect.succeed({
        states: {},
        transitioned: [],
        tokenStatus: "ok",
        repoStatus: "ok"
      } satisfies GitStatesResponse),
    ...overrides
  } satisfies TicketsShape)
}

function makeGitHub(overrides: Partial<GitHubShape> = {}) {
  return Layer.succeed(GitHub, {
    getInstallationAccount: () => unexpected("GitHub.getInstallationAccount"),
    listInstallationRepos: () => unexpected("GitHub.listInstallationRepos"),
    verifyInstallationRepo: () => unexpected("GitHub.verifyInstallationRepo"),
    exchangeAppUserCode: () => unexpected("GitHub.exchangeAppUserCode"),
    appUserCanAccessInstallation: () => Effect.succeed(true),
    createBranchAsUser: () => unexpected("GitHub.createBranchAsUser"),
    openPullRequestAsUser: () => unexpected("GitHub.openPullRequestAsUser"),
    fetchInstallationProjectStates: () =>
      unexpected("GitHub.fetchInstallationProjectStates"),
    listInstallationBranches: () =>
      unexpected("GitHub.listInstallationBranches"),
    branchExistsInstallation: () =>
      unexpected("GitHub.branchExistsInstallation"),
    fetchReviewPullRequestInstallation: () => Effect.succeed(rawPr()),
    fetchReviewFilesInstallation: () =>
      Effect.succeed({ files: [], page: 1, perPage: 30, hasMore: false }),
    fetchReviewCommentsInstallation: () =>
      Effect.succeed({ comments: [], threads: [] }),
    fetchReviewThreadsInstallation: () => Effect.succeed([]),
    submitReviewAsUser: () =>
      Effect.succeed({
        reviewId: "review-1",
        htmlUrl: "https://github.test/review/1"
      }),
    replyToReviewCommentAsUser: () =>
      unexpected("GitHub.replyToReviewCommentAsUser"),
    resolveReviewThreadAsUser: () =>
      unexpected("GitHub.resolveReviewThreadAsUser"),
    unresolveReviewThreadAsUser: () =>
      unexpected("GitHub.unresolveReviewThreadAsUser"),
    mergePullRequestAsUser: () =>
      Effect.succeed({ merged: true, sha: "merge-sha", message: "merged" }),
    closePullRequestAsUser: () =>
      Effect.succeed(rawPr({ state: "closed", mergeable: false })),
    reopenPullRequestAsUser: () => Effect.succeed(rawPr()),
    ...overrides
  } satisfies GitHubShape)
}

function makeBetterAuth(overrides: Partial<BetterAuthShape> = {}) {
  return Layer.succeed(BetterAuth, {
    handler: () => unexpected("BetterAuth.handler"),
    getSession: () => unexpected("BetterAuth.getSession"),
    getGithubAccessToken: () => Effect.succeed("ghu_token"),
    getPersonalGithub: () => unexpected("BetterAuth.getPersonalGithub"),
    getOrgSlugById: () => unexpected("BetterAuth.getOrgSlugById"),
    listOrganizations: () => unexpected("BetterAuth.listOrganizations"),
    listOrganizationsPaged: () =>
      unexpected("BetterAuth.listOrganizationsPaged"),
    getOrganization: () => unexpected("BetterAuth.getOrganization"),
    submitConsent: () => unexpected("BetterAuth.submitConsent"),
    ...overrides
  } satisfies BetterAuthShape)
}

function makeLayer(
  overrides: {
    readonly projects?: Partial<ProjectsShape>
    readonly tickets?: Partial<TicketsShape>
    readonly github?: Partial<GitHubShape>
    readonly betterAuth?: Partial<BetterAuthShape>
  } = {}
) {
  return ReviewsLive.pipe(
    Layer.provide(makeProjects(overrides.projects)),
    Layer.provide(makeTickets(overrides.tickets)),
    Layer.provide(makeGitHub(overrides.github)),
    Layer.provide(makeBetterAuth(overrides.betterAuth))
  )
}

it.effect("reads linked PR overview through installation access", () =>
  Effect.gen(function* () {
    const reviews = yield* Reviews
    const page = yield* reviews.get("org", "user-1", "app", 42)

    expect(page.pr.title).toBe("Add review backend")
    expect(page.linkedTicket.id).toBe(ticketId("T-1"))
    expect(page.linkedTicket.gitState.tag).toBe("pr_open")
    expect(page.pr.checks.status).toBe("passing")
    expect(page.reviewers.map((reviewer) => reviewer.actor.login)).toEqual([
      "reviewer"
    ])
    expect(page.participants.map((p) => p.actor.login)).toEqual([
      "octocat",
      "reviewer"
    ])
    expect(page.mergeMethods).toEqual({
      allowed: ["squash", "merge"],
      defaultMethod: "squash"
    })
    expect(page.capabilities.canReview).toBe(true)
    expect(page.capabilities.disabledReasons.review).toBeNull()
  }).pipe(Effect.provide(makeLayer()))
)

it.effect(
  "refreshes git state once before failing linked ticket resolution",
  () => {
    let attempts = 0
    let refreshes = 0

    return Effect.gen(function* () {
      const reviews = yield* Reviews
      const result = yield* reviews
        .get("org", "user-1", "app", 42)
        .pipe(Effect.either)

      expect(result._tag).toBe("Left")
      expect(attempts).toBe(2)
      expect(refreshes).toBe(1)
    }).pipe(
      Effect.provide(
        makeLayer({
          tickets: {
            findByPrNumber: () => {
              attempts += 1
              return Effect.fail(new NotFound())
            },
            listGitStates: () => {
              refreshes += 1
              return Effect.succeed({
                states: {},
                transitioned: [],
                tokenStatus: "ok",
                repoStatus: "ok"
              } satisfies GitStatesResponse)
            }
          }
        })
      )
    )
  }
)

it.effect(
  "marks write capabilities as requiring personal GitHub when no token exists",
  () =>
    Effect.gen(function* () {
      const reviews = yield* Reviews
      const page = yield* reviews.get("org", "user-1", "app", 42)

      expect(page.capabilities.canReview).toBe(false)
      expect(page.capabilities.canMerge).toBe(false)
      expect(page.capabilities.disabledReasons.review).toBe(
        "personal_github_required"
      )
      expect(page.capabilities.disabledReasons.merge).toBe(
        "personal_github_required"
      )
    }).pipe(
      Effect.provide(
        makeLayer({
          betterAuth: {
            getGithubAccessToken: () => Effect.fail(new NoGithubToken())
          }
        })
      )
    )
)

it.effect("does not read GitHub data when project membership fails", () => {
  let githubReads = 0

  return Effect.gen(function* () {
    const reviews = yield* Reviews
    const result = yield* reviews
      .get("org", "user-1", "app", 42)
      .pipe(Effect.either)

    expect(result._tag).toBe("Left")
    expect(githubReads).toBe(0)
  }).pipe(
    Effect.provide(
      makeLayer({
        projects: {
          getGithubIntegration: () => Effect.fail(new NotFound())
        },
        github: {
          fetchReviewPullRequestInstallation: () => {
            githubReads += 1
            return Effect.succeed(rawPr())
          }
        }
      })
    )
  )
})

it.effect(
  "returns review threads and mention candidates from GitHub data",
  () =>
    Effect.gen(function* () {
      const reviews = yield* Reviews
      const response = yield* reviews.comments("org", "user-1", "app", 42)

      expect(response.threads).toHaveLength(1)
      expect(response.threads[0].id).toBe("thread-1")
      expect(response.threads[0].firstComment.body).toBe("Please adjust this")
      expect(response.mentionCandidates.map((actor) => actor.login)).toEqual([
        "octocat",
        "reviewer",
        "commenter"
      ])
    }).pipe(
      Effect.provide(
        makeLayer({
          github: {
            fetchReviewThreadsInstallation: () =>
              Effect.succeed([
                {
                  id: "thread-1",
                  path: "src/app.ts",
                  resolved: false,
                  outdated: false,
                  side: "right",
                  line: 42,
                  startLine: 40,
                  comments: [
                    {
                      id: "comment-node-1",
                      databaseId: 123,
                      author: {
                        login: "commenter",
                        avatarUrl: null,
                        url: "https://github.test/commenter"
                      },
                      body: "Please adjust this",
                      htmlUrl: "https://github.test/comment/123",
                      path: "src/app.ts",
                      side: "right",
                      line: 42,
                      startLine: 40,
                      createdAt: isoDate("2026-05-20T09:00:00.000Z"),
                      updatedAt: isoDate("2026-05-20T09:00:00.000Z")
                    }
                  ]
                }
              ])
          }
        })
      )
    )
)

it.effect(
  "submits pending review comments through the user GitHub path",
  () => {
    const submitted: Array<unknown> = []

    return Effect.gen(function* () {
      const reviews = yield* Reviews
      const result = yield* reviews.submit("org", "user-1", "app", 42, {
        event: "request_changes",
        body: "Please fix",
        comments: [
          {
            path: "src/app.ts",
            body: "This range is off",
            side: "right",
            line: 42,
            startLine: 40
          }
        ]
      })

      expect(result.reviewId).toBe("review-1")
      expect(submitted).toEqual([
        {
          owner: "acme",
          name: "app",
          prNumber: 42,
          userId: "user-1",
          input: {
            event: "request_changes",
            body: "Please fix",
            comments: [
              {
                path: "src/app.ts",
                body: "This range is off",
                side: "right",
                line: 42,
                startLine: 40
              }
            ]
          }
        }
      ])
    }).pipe(
      Effect.provide(
        makeLayer({
          github: {
            submitReviewAsUser: (owner, name, prNumber, input, userId) => {
              submitted.push({ owner, name, prNumber, input, userId })
              return Effect.succeed({
                reviewId: "review-1",
                htmlUrl: "https://github.test/review/1"
              })
            }
          }
        })
      )
    )
  }
)

it.effect("close and reopen call the matching GitHub mutations", () => {
  const calls: Array<string> = []

  return Effect.gen(function* () {
    const reviews = yield* Reviews
    const closed = yield* reviews.close("org", "user-1", "app", 42)
    const reopened = yield* reviews.reopen("org", "user-1", "app", 42)

    expect(closed.pr.state).toBe("closed")
    expect(reopened.pr.state).toBe("open")
    expect(calls).toEqual(["close", "reopen"])
  }).pipe(
    Effect.provide(
      makeLayer({
        github: {
          closePullRequestAsUser: () => {
            calls.push("close")
            return Effect.succeed(
              rawPr({
                state: "closed",
                mergeable: false,
                closedAt: isoDate("2026-05-20T10:00:00.000Z")
              })
            )
          },
          reopenPullRequestAsUser: () => {
            calls.push("reopen")
            return Effect.succeed(rawPr())
          }
        }
      })
    )
  )
})

it.effect("resolves a thread and returns the refreshed thread", () =>
  Effect.gen(function* () {
    const reviews = yield* Reviews
    const result = yield* reviews.resolveThread(
      "org",
      "user-1",
      "app",
      42,
      "thread-1"
    )

    expect(result.thread.id).toBe("thread-1")
    expect(result.thread.resolved).toBe(true)
  }).pipe(
    Effect.provide(
      makeLayer({
        github: {
          resolveReviewThreadAsUser: (threadId) =>
            Effect.succeed({ threadId, resolved: true }),
          fetchReviewThreadsInstallation: () =>
            Effect.succeed([
              {
                id: "thread-1",
                path: "src/app.ts",
                resolved: true,
                outdated: false,
                side: "right",
                line: 42,
                startLine: null,
                comments: [
                  {
                    id: "comment-node-1",
                    databaseId: 123,
                    author: {
                      login: "commenter",
                      avatarUrl: null,
                      url: null
                    },
                    body: "Fixed",
                    htmlUrl: "https://github.test/comment/123",
                    path: "src/app.ts",
                    side: "right",
                    line: 42,
                    startLine: null,
                    createdAt: isoDate("2026-05-20T09:00:00.000Z"),
                    updatedAt: isoDate("2026-05-20T09:00:00.000Z")
                  }
                ]
              }
            ])
        }
      })
    )
  )
)

it.effect(
  "merge refreshes project git state without updating ticket status",
  () => {
    let refreshes = 0
    let updateCalls = 0

    return Effect.gen(function* () {
      const reviews = yield* Reviews
      const result = yield* reviews.merge("org", "user-1", "app", 42, {
        method: "squash"
      })

      expect(result.merged).toBe(true)
      expect(refreshes).toBe(1)
      expect(updateCalls).toBe(0)
    }).pipe(
      Effect.provide(
        makeLayer({
          tickets: {
            listGitStates: () => {
              refreshes += 1
              return Effect.succeed({
                states: {},
                transitioned: [],
                tokenStatus: "ok",
                repoStatus: "ok"
              } satisfies GitStatesResponse)
            },
            update: () => {
              updateCalls += 1
              return unexpected("Tickets.update")
            }
          }
        })
      )
    )
  }
)
