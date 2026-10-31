import { it } from "@effect/vitest"
import { BranchNotFound, Conflict, RateLimited, ProjectScope } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { asUser, passthroughTicketActivity } from "../activity/testing"
import { type GitHubShape } from "../github/GitHub"
import { applyPullRequestWebhookToTicket } from "../github/GitHubTicketEventsLive"
import { MarkdownError } from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import {
  DEFAULT_GIT_AUTOMATION_CONFIG,
  gitAutomationTestLayer,
  gitAutomationTestService
} from "../projects/gitAutomationTesting"
import * as TicketServices from "./layer"
import {
  isoDate,
  ticketStatus,
  githubIntegration,
  makeTicketDocument,
  makeFakeTicketDocs,
  makeFakeProjects,
  scopeIn,
  testInfra,
  FakeDb,
  FakeGroups,
  makeFakeAttachments,
  makeFakeFigmaLinks,
  FakeUsers,
  FakeComments,
  makeFakeGitHub,
  entryFromDocument,
  makeFakeTicketIndex,
  makeRecordingTicketIndex,
  PassthroughLibrary,
  makeTicketsLayer
} from "./testing"
import * as TicketCommands from "./TicketCommands"
import { TicketDocs, type TicketDocsShape } from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketGit from "./TicketGit"
import { TicketIndex } from "./TicketIndex"

it.effect("listGitStates fetches only distinct ticket branches", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3", "T-4"])
  docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
  docs.documents.set("T-2", makeTicketDocument("T-2", { branch: "feat/T-1" }))
  docs.documents.set("T-3", makeTicketDocument("T-3", { branch: "bug/T-3" }))

  const fetchedBranches: string[][] = []
  const layer = TicketServices.layer.pipe(
    Layer.provide(gitAutomationTestLayer()),
    Layer.provide(PassthroughLibrary),
    Layer.provide(passthroughTicketActivity),
    Layer.provide(docs.layer),
    Layer.provide(
      makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      })
    ),
    Layer.provide(FakeGroups),
    Layer.provide(FakeComments),
    Layer.provide(FakeUsers),
    Layer.provide(makeFakeAttachments()),
    Layer.provide(makeFakeFigmaLinks()),
    Layer.provide(
      makeFakeGitHub({
        fetchInstallationProjectStates: (
          _installationId,
          _owner,
          _name,
          branches
        ) => {
          fetchedBranches.push([...branches])
          return Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(["feat/T-1", "bug/T-3"]),
            prByBranch: new Map()
          })
        }
      })
    ),
    Layer.provide(makeFakeTicketIndex(docs.documents)),
    Layer.provide(FakeDb),
    Layer.provide(FinishedStatuses.baseline),
    Layer.provideMerge(testInfra())
  )

  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const result = yield* git.listGitStates()

    expect(fetchedBranches).toEqual([["feat/T-1", "bug/T-3"]])
    expect(result.states["T-1"]).toEqual({
      tag: "branch_no_pr",
      name: "feat/T-1",
      baseBranch: "main"
    })
    expect(result.states["T-4"]).toEqual({
      tag: "no_branch",
      baseBranch: "main"
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "listGitStates skips a stale git write when a ticket branch changes during the fetch",
  () => {
    const clearedBranches: string[] = []
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { branch: "feat/T-1-current" })
    )
    const indexedTicket = makeTicketDocument("T-1", {
      branch: "feat/T-1-old"
    })
    const layer = TicketServices.layer.pipe(
      Layer.provide(gitAutomationTestLayer()),
      Layer.provide(PassthroughLibrary),
      Layer.provide(passthroughTicketActivity),
      Layer.provide(docs.layer),
      Layer.provide(
        makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        })
      ),
      Layer.provide(FakeGroups),
      Layer.provide(FakeComments),
      Layer.provide(FakeUsers),
      Layer.provide(makeFakeAttachments()),
      Layer.provide(makeFakeFigmaLinks()),
      Layer.provide(
        makeFakeGitHub({
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              mergedPrsByBranch: new Map(),
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              existingBranches: new Set(["feat/T-1-old"]),
              prByBranch: new Map([
                [
                  "feat/T-1-old",
                  {
                    headRefName: "feat/T-1-old",
                    baseRefName: "main",
                    state: "merged",
                    draft: false,
                    number: 42,
                    url: "https://github.com/acme/app/pull/42",
                    title: "Old branch",
                    mergedAt: null,
                    checks: "passing"
                  }
                ]
              ])
            })
        })
      ),
      Layer.provide(
        makeFakeTicketIndex(docs.documents, {
          clearBranchStale: (_project, ids) =>
            Effect.sync(() => {
              clearedBranches.push(...ids)
            }),
          list: () =>
            Effect.succeed([
              {
                ...entryFromDocument(indexedTicket),
                branchDeletedAt: indexedTicket.updatedAt,
                checks: null,
                checksHeadSha: null,
                checksUpdatedAt: null
              }
            ])
        })
      ),
      Layer.provide(FakeDb),
      Layer.provide(FinishedStatuses.baseline),
      Layer.provideMerge(testInfra())
    )

    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()

      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1-current",
        pr: null,
        prState: null,
        status: ticketStatus("todo")
      })
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "feat/T-1-current",
        baseBranch: "main"
      })
      expect(result.transitioned).toEqual([])
      expect(clearedBranches).toEqual([])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates follows merge bases until they reach the default branch",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 5,
        prState: "merged",
        prBase: "release"
      })
    )
    const merges = new Map(
      (
        [
          ["feat/T-1", "release", 5, "2026-05-01T09:00:00Z"],
          ["release", "staging", 6, "2026-05-01T10:00:00Z"],
          ["staging", "b3", 7, "2026-05-01T11:00:00Z"],
          ["b3", "b4", 8, "2026-05-01T12:00:00Z"],
          ["b4", "b5", 9, "2026-05-01T13:00:00Z"],
          ["b5", "b6", 10, "2026-05-01T14:00:00Z"],
          ["b6", "b7", 11, "2026-05-01T15:00:00Z"],
          ["b7", "main", 12, "2026-05-01T16:00:00Z"]
        ] satisfies ReadonlyArray<readonly [string, string, number, string]>
      ).map(([head, base, number, mergedAt]) => [
        head,
        {
          headRefName: head,
          baseRefName: base,
          state: "merged" as const,
          draft: false,
          number: number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: head,
          mergedAt: DateTime.toDate(DateTime.makeUnsafe(mergedAt)),
          checks: "passing" as const
        }
      ])
    )
    const fetchedBranches: Array<ReadonlyArray<string>> = []
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: (
          _installation,
          _owner,
          _name,
          branches
        ) => {
          fetchedBranches.push([...branches])
          return Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(branches),
            prByBranch: new Map(
              branches.flatMap((branch) => {
                const pr = merges.get(branch)
                return pr === undefined ? [] : [[branch, pr] as const]
              })
            )
          })
        }
      })
    })

    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.listGitStates()

      expect(fetchedBranches).toEqual([
        ["feat/T-1", "release"],
        ["staging"],
        ["b3"],
        ["b4"],
        ["b5"],
        ["b6"],
        ["b7"]
      ])
      expect(docs.documents.get("T-1")).toMatchObject({
        pr: 5,
        prState: "merged",
        lastTransitionedPr: 5
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates without reconcile reads GitHub and writes nothing",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    docs.documents.set(
      "T-2",
      makeTicketDocument("T-2", { branch: "feat/T-2-gone" })
    )
    const before = docs.documents.get("T-1")
    const beforeGone = docs.documents.get("T-2")
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            mergedPrsByBranch: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            existingBranches: new Set(["feat/T-1-external"]),
            prByBranch: new Map([
              [
                "feat/T-1-external",
                {
                  headRefName: "feat/T-1-external",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "External change",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates({ reconcile: false })
      expect(result.changedTicketIds).toEqual([])
      expect(result.transitioned).toEqual([])
      expect(result.states["T-1"]).toMatchObject({ tag: "no_branch" })
      expect(result.states["T-2"]).toMatchObject({ tag: "stale_branch" })
      expect(docs.documents.get("T-1")).toEqual(before)
      expect(docs.documents.get("T-2")).toEqual(beforeGone)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("listGitStates links an external branch and its existing PR", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const queries: Array<string | undefined> = []
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: (
        _installation,
        _owner,
        _repo,
        _branches,
        query
      ) => {
        queries.push(query)
        return Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          mergedPrsByBranch: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["feat/T-1-external"]),
          prByBranch: new Map([
            [
              "feat/T-1-external",
              {
                headRefName: "feat/T-1-external",
                baseRefName: "main",
                state: "open",
                draft: false,
                number: 42,
                url: "https://github.com/acme/app/pull/42",
                title: "External change",
                mergedAt: null,
                checks: "passing"
              }
            ]
          ])
        })
      }
    })
  })
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const result = yield* git.listGitStates()
    expect(queries).toEqual(["T-"])
    expect(result.changedTicketIds).toEqual(["T-1"])
    expect(docs.documents.get("T-1")).toMatchObject({
      branch: "feat/T-1-external",
      pr: 42,
      prState: "open"
    })
    expect(result.states["T-1"]).toMatchObject({ tag: "pr_open", number: 42 })
    yield* git.listGitStates()
    expect(queries).toEqual(["T-", "T-"])
  }).pipe(Effect.provide(layer))
})

it.effect(
  "listGitStates links a branch named only in its open PR's title and applies the PR rule",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            existingBranches: new Set(["fix-login"]),
            prByBranch: new Map([
              [
                "fix-login",
                {
                  headRefName: "fix-login",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "T-1: fix login",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ]),
            openPullRequestText: new Map([
              ["fix-login", { title: "T-1: fix login", body: "" }]
            ])
          })
      }),
      gitAutomation: {
        ...DEFAULT_GIT_AUTOMATION_CONFIG,
        rules: {
          ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
          pr_opened: ticketStatus("in_progress")
        }
      }
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(result.changedTicketIds).toEqual(["T-1"])
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "fix-login",
        pr: 42,
        prState: "open",
        status: "in_progress"
      })
    }).pipe(Effect.provide(layer))
  }
)

const mergedPullRequest = (baseRefName: string) => ({
  headRefName: "feat/T-1",
  baseRefName,
  state: "merged" as const,
  draft: false,
  number: 42,
  url: "https://github.com/acme/app/pull/42",
  title: "Merged",
  mergedAt: null,
  checks: "passing" as const
})

const mergedSnapshotLayer = (
  docs: ReturnType<typeof makeFakeTicketDocs>,
  baseRefName: string
) =>
  makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () =>
        Effect.succeed({ ...githubIntegration, defaultBaseBranch: "release" })
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set(["feat/T-1"]),
          prByBranch: new Map([["feat/T-1", mergedPullRequest(baseRefName)]])
        })
    })
  })

it.effect(
  "listGitStates moves a merged ticket once and leaves a manual move back alone",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const git = yield* TicketGit.TicketGit
      const first = yield* git.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("done"),
        prState: "merged",
        lastTransitionedPr: 42
      })
      expect(first.transitioned).toEqual([
        {
          ticketId: "T-1",
          fromStatus: ticketStatus("todo"),
          toStatus: ticketStatus("done"),
          prNumber: 42
        }
      ])

      yield* tickets.update("T-1", { status: ticketStatus("in_progress") })
      const second = yield* git.listGitStates()
      expect(docs.documents.get("T-1")?.status).toBe(
        ticketStatus("in_progress")
      )
      expect(second.transitioned).toEqual([])
    }).pipe(Effect.provide(mergedSnapshotLayer(docs, "release")))
  }
)

it.effect(
  "listGitStates records a merge into another branch without moving the ticket",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("todo"),
        prState: "merged"
      })
      expect(result.transitioned).toEqual([])
    }).pipe(Effect.provide(mergedSnapshotLayer(docs, "feat/stack-base")))
  }
)

it.effect("attachBranch moves the ticket by the branch rule", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      branchExistsInstallation: () => Effect.succeed(true)
    }),
    gitAutomation: {
      ...DEFAULT_GIT_AUTOMATION_CONFIG,
      rules: {
        ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
        branch_linked: ticketStatus("in_progress")
      }
    }
  })
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    yield* git.attachBranch("T-1", { name: "feat/T-1" })
    expect(docs.documents.get("T-1")).toMatchObject({
      branch: "feat/T-1",
      status: ticketStatus("in_progress")
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "explicit unlink survives edits and refresh until manual attachment",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        branchExistsInstallation: () => Effect.succeed(true),
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            mergedPrsByBranch: new Map(),
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            existingBranches: new Set(["feat/T-1"]),
            prByBranch: new Map()
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const git = yield* TicketGit.TicketGit
      yield* git.clearBranch("T-1")
      yield* tickets.update("T-1", { title: "Renamed" })
      const result = yield* git.listGitStates()
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: null,
        branchAutoLinkDisabled: true,
        ignoredBranches: ["feat/T-1"],
        title: "Renamed"
      })
      expect(result.states["T-1"]).toEqual({
        tag: "no_branch",
        baseBranch: "main"
      })
      yield* git.attachBranch("T-1", {
        name: "feat/T-1"
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        branchAutoLinkDisabled: false
      })
      expect(docs.documents.get("T-1")?.ignoredBranches ?? []).toEqual([])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "automatic linking does not overwrite a manual link made during discovery",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.sync(() => {
            docs.documents.set(
              "T-1",
              makeTicketDocument("T-1", { branch: "manual-branch" })
            )
            return {
              defaultBranch: "main",
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(["feat/T-1"]),
              prByBranch: new Map()
            }
          })
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(docs.documents.get("T-1")?.branch).toBe("manual-branch")
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "manual-branch",
        baseBranch: "main"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("reserved repository branches require manual attachment", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents, {
      isRepositoryBranchAttached: (repoId, branch, stackedOnly) => {
        expect(repoId).toBe("repo-1")
        expect(branch).toBe("feat/T-1")
        return Effect.succeed(!stackedOnly)
      }
    }),
    github: makeFakeGitHub({
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["feat/T-1"]),
          prByBranch: new Map()
        }),
      branchExistsInstallation: () => Effect.succeed(true)
    })
  })
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const result = yield* git.listGitStates()
    expect(result.states["T-1"].tag).toBe("no_branch")
    expect(result.changedTicketIds).toEqual([])
    expect(docs.documents.get("T-1")?.branch).toBeNull()
    yield* git.attachBranch("T-1", {
      name: "feat/T-1"
    })
    expect(docs.documents.get("T-1")?.branch).toBe("feat/T-1")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "concurrent projects cannot automatically claim the same branch",
  () =>
    Effect.gen(function* () {
      const scansReady = yield* Deferred.make<void>()
      const checkStarted = yield* Deferred.make<void>()
      const releaseCheck = yield* Deferred.make<void>()
      const documents = new Map([
        ["a", makeTicketDocument("T-1")],
        ["b", makeTicketDocument("T-1")]
      ])
      let scans = 0
      let checks = 0
      const docs = makeFakeTicketDocs([])
      const layer = makeTicketsLayer(
        "T",
        Layer.succeed(TicketDocs, {
          ...docs.service,
          read: (_org, slug) => Effect.succeed(documents.get(slug)!),
          update: (_org, slug, _id, transform, onPersist) =>
            Effect.gen(function* () {
              const next = yield* transform(documents.get(slug)!)
              documents.set(slug, next)
              if (onPersist) yield* onPersist(next)
              return next
            }),
          write: (_org, slug, _id, document) =>
            Effect.sync(() => {
              documents.set(slug, document)
            })
        }),
        {
          projects: makeFakeProjects("T", {
            githubIntegration: () =>
              Effect.map(ProjectScope, ({ slug }) => ({
                ...githubIntegration,
                projectId: slug,
                projectSlug: slug
              }))
          }),
          ticketIndex: makeFakeTicketIndex(new Map(), {
            projectFor: (orgSlug, slug) =>
              Effect.succeed({
                orgSlug,
                organizationId: orgSlug,
                projectId: slug,
                projectSlug: slug
              }),
            list: (project) =>
              Effect.sync(() => [
                entryFromDocument(documents.get(project.projectSlug)!)
              ]),
            isRepositoryBranchAttached: () =>
              Effect.gen(function* () {
                checks += 1
                const attached = [...documents.values()].some(
                  (doc) => doc.branch === "feat/T-1"
                )
                yield* Deferred.succeed(checkStarted, undefined)
                yield* Deferred.await(releaseCheck)
                return attached
              }),
            upsertTicket: () => Effect.void
          }),
          github: makeFakeGitHub({
            fetchInstallationProjectStates: () =>
              Effect.gen(function* () {
                scans += 1
                if (scans === 2) yield* Deferred.succeed(scansReady, undefined)
                yield* Deferred.await(scansReady)
                return {
                  defaultBranch: "main",
                  openPullRequestText: new Map(),
                  fetchedAt: isoDate("2026-04-01T00:00:00Z"),
                  mergedPrsByBranch: new Map(),
                  existingBranches: new Set(["feat/T-1"]),
                  prByBranch: new Map()
                }
              })
          })
        }
      )
      yield* Effect.gen(function* () {
        const git = yield* TicketGit.TicketGit
        const scans = yield* Effect.all(
          [
            git
              .listGitStates()
              .pipe(Effect.provideService(ProjectScope, scopeIn("org-a", "a"))),
            git
              .listGitStates()
              .pipe(Effect.provideService(ProjectScope, scopeIn("org-b", "b")))
          ],
          { concurrency: 2 }
        ).pipe(Effect.forkChild)
        yield* Deferred.await(checkStarted)
        yield* Effect.yieldNow
        expect(checks).toBe(1)
        yield* Deferred.succeed(releaseCheck, undefined)
        const results = yield* Fiber.join(scans)
        expect(checks).toBe(2)
        expect(
          [...documents.values()].filter((doc) => doc.branch === "feat/T-1")
        ).toHaveLength(1)
        expect(
          results.flatMap((result) => result.changedTicketIds ?? [])
        ).toEqual(["T-1"])
      }).pipe(Effect.provide(layer))
    })
)

it.effect("manual unlink waits for a webhook write and remains unlinked", () =>
  Effect.gen(function* () {
    const writeStarted = yield* Deferred.make<void>()
    const releaseWrite = yield* Deferred.make<void>()
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const coordinatedDocs: TicketDocsShape = {
      ...docs.service,
      update: (org, slug, id, transform, onPersist) =>
        docs.service.update(
          org,
          slug,
          id,
          (document) =>
            Effect.gen(function* () {
              const next = yield* transform(document)
              if (next.pr === 42) {
                yield* Deferred.succeed(writeStarted, undefined)
                yield* Deferred.await(releaseWrite)
              }
              return next
            }),
          onPersist
        )
    }
    const indexLayer = makeFakeTicketIndex(docs.documents)
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs, coordinatedDocs),
      {
        projects: makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        }),
        ticketIndex: indexLayer
      }
    )
    return yield* Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const index = yield* TicketIndex
      const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock
      const webhook = yield* Effect.forkChild(
        applyPullRequestWebhookToTicket(
          {
            ticketDocs: coordinatedDocs,
            ticketIndex: index,
            ticketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          {
            orgSlug: "org",
            projectSlug: "p",
            organizationId: "org-1",
            projectId: "project-1",
            ticketId: "T-1",
            branch: "feat/T-1"
          },
          {
            installationId: "123",
            repositoryId: "repo-1",
            branch: "feat/T-1",
            number: 42,
            title: "First",
            body: "",
            state: "open",
            draft: false,
            updatedAt: null,
            baseBranch: "main",
            defaultBranch: "main"
          },
          "delivery-1"
        )
      )
      yield* Deferred.await(writeStarted)
      const unlink = yield* Effect.forkChild(git.clearBranch("T-1"))
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseWrite, undefined)
      yield* Fiber.join(webhook)
      yield* Fiber.join(unlink)
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: null,
        pr: null,
        prState: null,
        branchAutoLinkDisabled: true
      })
    }).pipe(Effect.provide(Layer.merge(layer, indexLayer)))
  }).pipe(Effect.scoped)
)

it.effect(
  "rate-limited refresh keeps the persisted branch and exposes retry time",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.fail(new RateLimited({ resetAt: 1234 }))
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(result).toMatchObject({
        refreshStatus: "rate_limited",
        retryAt: 1234,
        changedTicketIds: [],
        transitioned: []
      })
      expect(result.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "feat/T-1",
        baseBranch: "main"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "stale GitHub snapshots display known PRs without applying transitions or automatic links",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-04-01T00:00:00Z"),
            mergedPrsByBranch: new Map(),
            refreshStatus: "stale",
            existingBranches: new Set(["feat/T-1", "feat/T-2"]),
            prByBranch: new Map([
              [
                "feat/T-1",
                {
                  headRefName: "feat/T-1",
                  baseRefName: "main",
                  state: "merged",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "Merged",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(result).toMatchObject({
        refreshStatus: "stale",
        changedTicketIds: [],
        transitioned: []
      })
      expect(result.states["T-1"]).toMatchObject({
        tag: "pr_merged",
        number: 42
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        status: ticketStatus("todo"),
        pr: null
      })
      expect(docs.documents.get("T-2")?.branch).toBeNull()
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "an older cached GitHub snapshot cannot undo a newer persisted merge",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 42,
        prState: "merged",
        lastTransitionedPr: 42,
        status: ticketStatus("done")
      })
    )
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        fetchInstallationProjectStates: () =>
          Effect.succeed({
            defaultBranch: "main",
            mergedPrsByBranch: new Map(),
            openPullRequestText: new Map(),
            fetchedAt: isoDate("2026-03-31T23:59:00Z"),
            existingBranches: new Set(["feat/T-1"]),
            prByBranch: new Map([
              [
                "feat/T-1",
                {
                  headRefName: "feat/T-1",
                  baseRefName: "main",
                  state: "open",
                  draft: false,
                  number: 42,
                  url: "https://github.com/acme/app/pull/42",
                  title: "Open",
                  mergedAt: null,
                  checks: "passing"
                }
              ]
            ])
          })
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()
      expect(result.changedTicketIds).toEqual([])
      expect(result.states["T-1"]).toMatchObject({
        tag: "pr_merged",
        number: 42
      })
      expect(docs.documents.get("T-1")?.prState).toBe("merged")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("createBranch writes markdown and upserts the ticket index", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", { branchAutoLinkDisabled: true })
  )
  const index = makeRecordingTicketIndex(docs.documents)
  const createdBranches: Array<{
    readonly owner: string
    readonly repo: string
    readonly branch: string
    readonly base: string
    readonly userId: string
  }> = []
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    github: makeFakeGitHub({
      createBranchAsUser: (owner, repo, branch, base, userId) =>
        Effect.sync(() => {
          createdBranches.push({ owner, repo, branch, base, userId })
          return { name: branch, sha: "sha-1" }
        })
    }),
    ticketIndex: index.layer
  })

  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const updated = yield* git.createBranch("T-1", {
      name: "feat/T-1"
    })

    expect(updated.branch).toBe("feat/T-1")
    expect(docs.documents.get("T-1")?.branchAutoLinkDisabled).toBe(false)
    expect(docs.documents.get("T-1")?.branch).toBe("feat/T-1")
    expect(createdBranches).toEqual([
      {
        owner: "acme",
        repo: "app",
        branch: "feat/T-1",
        base: "main",
        userId: "user-1"
      }
    ])
    expect(index.calls).toEqual([
      {
        type: "upsert",
        ticketId: "T-1"
      }
    ])
  }).pipe(Effect.provide(layer))
})

it.effect(
  "clearBranch clears markdown and upserts the ticket index row",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set("T-1", makeTicketDocument("T-1", { branch: "feat/T-1" }))
    const index = makeRecordingTicketIndex(docs.documents)
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: index.layer
    })

    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const updated = yield* git.clearBranch("T-1")

      expect(updated.branch).toBeNull()
      expect(docs.documents.get("T-1")?.branch).toBeNull()
      expect(index.calls).toEqual([
        {
          type: "upsert",
          ticketId: "T-1"
        }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "creating a branch preserves comments added during the GitHub request",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      projects: makeFakeProjects("T", {
        githubIntegration: () => Effect.succeed(githubIntegration)
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents),
      github: makeFakeGitHub({
        createBranchAsUser: () =>
          docs.service
            .update("org", "p", "T-1", (document) =>
              Effect.succeed({
                ...document,
                commentsRegion: "Concurrent comment"
              })
            )
            .pipe(
              asUser("user-1"),
              Effect.as({ name: "feat/T-1", sha: "abc123" }),
              Effect.orDie
            )
      })
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.createBranch("T-1", {
        name: "feat/T-1"
      })
      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        commentsRegion: "Concurrent comment"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates fires the branch deleted rule once for a branch gone from GitHub",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        status: ticketStatus("in_review"),
        updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-05-01T00:00:00Z"))
      })
    )
    const stale = new Set<string>()
    const diskFull = new MarkdownError({ message: "disk full", cause: null })
    let failMove = true
    const failingDocs: TicketDocsShape = {
      ...docs.service,
      update: (org, slug, id, transform, onPersist, activity) =>
        docs.service.update(
          org,
          slug,
          id,
          (current) =>
            transform(current).pipe(
              Effect.tap((next) => {
                if (next.status !== "todo" || !failMove) return Effect.void
                failMove = false
                return Effect.fail(diskFull)
              })
            ),
          onPersist,
          activity
        )
    }
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs, failingDocs),
      {
        projects: makeFakeProjects("T", {
          githubIntegration: () => Effect.succeed(githubIntegration)
        }),
        ticketIndex: makeFakeTicketIndex(docs.documents, {
          list: () =>
            Effect.sync(() =>
              [...docs.documents.values()].map((document) => ({
                ...entryFromDocument(document),
                branchDeletedAt: stale.has(document.id)
                  ? DateTime.toDate(DateTime.makeUnsafe("2026-06-01T00:00:00Z"))
                  : null
              }))
            ),
          markBranchStale: (_projectId, branch) =>
            Effect.sync(() =>
              [...docs.documents.values()].flatMap((document) => {
                if (document.branch !== branch || stale.has(document.id)) {
                  return []
                }
                stale.add(document.id)
                return [document.id]
              })
            )
        }),
        github: makeFakeGitHub({
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              openPullRequestText: new Map(),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(),
              prByBranch: new Map([["feat/T-1", mergedPullRequest("main")]]),
              fetchedAt: DateTime.toDate(
                DateTime.makeUnsafe("2026-06-01T00:00:00Z")
              )
            })
        }),
        gitAutomation: {
          ...DEFAULT_GIT_AUTOMATION_CONFIG,
          rules: {
            ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
            branch_deleted: ticketStatus("todo")
          },
          forwardOnly: false
        }
      }
    )
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      expect(yield* Effect.flip(git.listGitStates())).toEqual(diskFull)
      expect(stale.size).toBe(0)
      const first = yield* git.listGitStates()
      expect(first.changedTicketIds).toEqual(["T-1"])
      expect(docs.documents.get("T-1")?.status).toBe(ticketStatus("todo"))

      const moved = docs.documents.get("T-1")
      if (moved) {
        docs.documents.set("T-1", {
          ...moved,
          status: ticketStatus("in_progress")
        })
      }
      yield* git.listGitStates()
      expect(docs.documents.get("T-1")?.status).toBe(
        ticketStatus("in_progress")
      )
    }).pipe(Effect.provide(layer))
  }
)

const stackLayer = (
  docs: ReturnType<typeof makeFakeTicketDocs>,
  github: Partial<GitHubShape> = {}
) =>
  makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
    }),
    ticketIndex: makeFakeTicketIndex(docs.documents),
    github: makeFakeGitHub({
      branchExistsInstallation: (_installation, _owner, _repo, branch) =>
        Effect.succeed(branch !== "missing"),
      fetchInstallationProjectStates: () =>
        Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(),
          prByBranch: new Map()
        }),
      ...github
    })
  })

it.effect(
  "stackBranch adds a branch on top of the ticket's own and forgets it was ignored",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        ignoredBranches: ["feat/T-1-ui"]
      })
    )
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.stackBranch("T-1", { name: "feat/T-1-ui" })

      expect(docs.documents.get("T-1")).toMatchObject({
        branch: "feat/T-1",
        stack: [
          {
            branch: "feat/T-1-ui",
            base: "feat/T-1",
            pr: 43,
            prState: "open",
            prDraft: true
          }
        ],
        ignoredBranches: []
      })
    }).pipe(
      Effect.provide(
        stackLayer(docs, {
          fetchInstallationProjectStates: () =>
            Effect.succeed({
              defaultBranch: "main",
              openPullRequestText: new Map(),
              fetchedAt: isoDate("2026-04-01T00:00:00Z"),
              mergedPrsByBranch: new Map(),
              existingBranches: new Set(["feat/T-1-ui"]),
              prByBranch: new Map([
                [
                  "feat/T-1-ui",
                  {
                    ...mergedPullRequest("feat/T-1"),
                    state: "open",
                    draft: true,
                    number: 43
                  }
                ]
              ])
            })
        })
      )
    )
  }
)

it.effect("attachBranch refuses a branch already stacked on the ticket", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "feat/T-1-ui", base: "feat/T-1" }]
    })
  )
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const failure = yield* Effect.flip(
      git.attachBranch("T-1", { name: "feat/T-1-ui" })
    )

    expect(failure).toEqual(
      new Conflict({ reason: "branch_already_on_ticket" })
    )
    expect(docs.documents.get("T-1")).toMatchObject({ branch: "feat/T-1" })
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect("attachBranch rejects a branch stacked on another ticket", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "shared-ui", base: "feat/T-1" }]
    })
  )
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    expect(
      yield* Effect.flip(git.attachBranch("T-2", { name: "shared-ui" }))
    ).toEqual(new Conflict({ reason: "branch_on_other_ticket" }))
    expect(docs.documents.get("T-2")?.branch).toBeNull()
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect("stackBranch refuses branches that can't be stacked", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      stack: [{ branch: "feat/T-1-ui" }]
    })
  )
  docs.documents.set("T-3", makeTicketDocument("T-3", { branch: "feat/T-3" }))
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    const failures = yield* Effect.forEach(
      [
        ["T-2", "feat/T-2-ui"],
        ["T-1", "feat/T-1"],
        ["T-1", "feat/T-1-ui"],
        ["T-1", "missing"],
        ["T-1", "feat/T-3"]
      ] as const,
      ([id, name]) => Effect.flip(git.stackBranch(id, { name }))
    )

    expect(failures).toEqual([
      new Conflict({ reason: "no_branch_on_ticket" }),
      new Conflict({ reason: "branch_already_on_ticket" }),
      new Conflict({ reason: "branch_already_on_ticket" }),
      new BranchNotFound({ name: "missing" }),
      new Conflict({ reason: "branch_on_other_ticket" })
    ])
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect(
  "unstackBranch removes a stacked branch and ignores it from then on",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        stack: [{ branch: "feat/T-1-ui" }, { branch: "feat/T-1-docs" }]
      })
    )
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.unstackBranch("T-1", { name: "feat/T-1-ui" })
      const missing = yield* Effect.flip(
        git.unstackBranch("T-1", { name: "feat/T-1-ui" })
      )

      expect(docs.documents.get("T-1")).toMatchObject({
        stack: [{ branch: "feat/T-1-docs" }],
        ignoredBranches: ["feat/T-1-ui"]
      })
      expect(missing).toEqual(new Conflict({ reason: "branch_not_stacked" }))
    }).pipe(Effect.provide(stackLayer(docs)))
  }
)

it.effect("clearBranch drops the stack and the pull request base", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      pr: 41,
      prState: "open",
      prBase: "main",
      stack: [{ branch: "feat/T-1-ui" }]
    })
  )
  return Effect.gen(function* () {
    const git = yield* TicketGit.TicketGit
    yield* git.clearBranch("T-1")

    const cleared = docs.documents.get("T-1")
    expect(cleared?.branch).toBeNull()
    expect(cleared?.stack).toEqual([])
    expect(cleared).not.toHaveProperty("prBase")
  }).pipe(Effect.provide(stackLayer(docs)))
})

it.effect(
  "listGitStates stacks a discovered pull request and follows stacked ones",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 41,
        prState: "open",
        prBase: "main",
        stack: [{ branch: "feat/T-1-api", base: "feat/T-1" }]
      })
    )
    const requested: Array<ReadonlyArray<string>> = []
    const pr = (
      headRefName: string,
      baseRefName: string,
      number: number,
      state: "open" | "merged" = "open"
    ) =>
      [
        headRefName,
        {
          headRefName,
          baseRefName,
          state,
          draft: false,
          number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: headRefName,
          mergedAt: null,
          checks: "passing" as const
        }
      ] as const
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, branches) => {
        requested.push(branches)
        return Effect.succeed({
          defaultBranch: "main",
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set([
            "feat/T-1",
            "feat/T-1-api",
            "checkout-ui"
          ]),
          prByBranch: new Map([
            pr("feat/T-1", "main", 41),
            pr("feat/T-1-api", "feat/T-1", 42, "merged"),
            pr("checkout-ui", "feat/T-1-api", 43)
          ]),
          openPullRequestText: new Map([
            ["checkout-ui", { title: "T-1: checkout UI", body: "" }]
          ])
        })
      }
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      const result = yield* git.listGitStates()

      expect(requested).toEqual([["feat/T-1", "feat/T-1-api"]])
      expect(result.changedTicketIds).toEqual(["T-1"])
      expect(
        result.stacks?.["T-1"]?.map((layer) => [
          layer.branch,
          layer.depth,
          layer.pr?.state
        ])
      ).toEqual([
        ["feat/T-1-api", 1, "merged"],
        ["checkout-ui", 2, "open"]
      ])
      expect(docs.documents.get("T-1")?.stack).toEqual([
        { branch: "feat/T-1-api", base: "feat/T-1", pr: 42, prState: "merged" },
        { branch: "checkout-ui", base: "feat/T-1-api", pr: 43, prState: "open" }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates discovers stack branches even when the owning PR is merged",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "feat/T-1",
        pr: 41,
        prState: "merged",
        lastTransitionedPr: 41
      })
    )
    const queries: Array<string | undefined> = []
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, _branches, query) => {
        queries.push(query)
        return Effect.succeed({
          defaultBranch: "main",
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          mergedPrsByBranch: new Map(),
          existingBranches: new Set(),
          prByBranch: new Map()
        })
      }
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.listGitStates()
      expect(queries).toEqual(["T-"])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "listGitStates lands a merge once the branch it went into reaches the default branch",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        branch: "api",
        pr: 41,
        prState: "merged",
        prBase: "feat/base",
        lastTransitionedPr: null
      })
    )
    const requested: Array<ReadonlyArray<string>> = []
    const merged = (
      headRefName: string,
      baseRefName: string,
      number: number,
      mergedAt: string
    ) =>
      [
        headRefName,
        {
          headRefName,
          baseRefName,
          state: "merged" as const,
          draft: false,
          number,
          url: `https://github.com/acme/app/pull/${number}`,
          title: headRefName,
          mergedAt: DateTime.toDate(DateTime.makeUnsafe(mergedAt)),
          checks: "passing" as const
        }
      ] as const
    const layer = stackLayer(docs, {
      fetchInstallationProjectStates: (_i, _o, _r, branches) => {
        requested.push(branches)
        return Effect.succeed({
          defaultBranch: "main",
          mergedPrsByBranch: new Map(),
          openPullRequestText: new Map(),
          fetchedAt: isoDate("2026-04-01T00:00:00Z"),
          existingBranches: new Set(["api"]),
          prByBranch: new Map([
            merged("api", "feat/base", 41, "2026-05-01T09:00:00Z"),
            merged("feat/base", "main", 50, "2026-05-01T10:00:00Z")
          ])
        })
      }
    })
    return Effect.gen(function* () {
      const git = yield* TicketGit.TicketGit
      yield* git.listGitStates()

      expect(requested).toEqual([["api", "feat/base"]])
      expect(docs.documents.get("T-1")).toMatchObject({
        lastTransitionedPr: 41,
        status: ticketStatus("done")
      })
    }).pipe(Effect.provide(layer))
  }
)
