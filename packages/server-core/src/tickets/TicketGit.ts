import {
  type AttachBranchInput,
  BranchNotFound,
  Conflict,
  type CreateBranchInput,
  type GitHubError,
  type GitHubScopeInsufficient,
  type GitHubTokenExpired,
  GitStatesResponse,
  type OpenPrInput,
  ProjectScope,
  type RateLimited,
  type RepoGone,
  type StackLayerState,
  type TransitionRecord,
  TicketBranchEntry,
  TicketId,
  ActivityActor,
  type BranchExists,
  type BranchProtected,
  type NotFound,
  type OpenPrResult,
  type TicketDetail
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

import * as GitHub from "../github/GitHub"
import type { MarkdownError } from "../markdown/Markdown"
import { ProjectGitAutomation } from "../projects/ProjectGitAutomation"
import { Projects, type ProjectGithubIntegration } from "../projects/Projects"
import {
  gitAutomationActivity,
  moveForDeletedBranch,
  withGitAutomation
} from "./moveByGitAutomation"
import { stackLayerStates } from "./stackLayerStates"
import * as TicketBranchIndex from "./TicketBranchIndex"
import { TicketDocs, type TicketDocument } from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import {
  planAutomaticBranchLinks,
  planAutomaticStacks,
  planStackPullRequests,
  planTicketGitStates
} from "./ticketGitStatePlanner"
import { TicketIndex, type TicketIndexEntry } from "./TicketIndex"
import {
  indexProjectOf,
  pendingGitState,
  type TicketReadError
} from "./ticketPresentation"
import type { TicketProject } from "./ticketProject"
import { stackLayerFor, ticketBranches } from "./ticketStack"
import * as TicketView from "./TicketView"

const makeTicketId = Schema.decodeUnknownSync(TicketId)

type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | RateLimited
  | GitHubError

export type GitStateOptions = Readonly<{ reconcile: boolean }>

type StackedTicketEntry = TicketIndexEntry &
  Readonly<{
    stack: ReadonlyArray<TicketBranchEntry>
  }>

const sameStack = Schema.toEquivalence(Schema.Array(TicketBranchEntry))

type TicketBranches = Readonly<{
  id: string
  branch: string | null
  stack: ReadonlyArray<TicketBranchEntry>
}>

const stacksOf = (
  tickets: Iterable<TicketBranches>,
  github: ProjectGithubIntegration,
  raw?: GitHub.RawProjectStates
): Record<string, ReadonlyArray<StackLayerState>> =>
  Object.fromEntries(
    [...tickets].flatMap((ticket) =>
      ticket.stack.length === 0
        ? []
        : [
            [
              ticket.id,
              stackLayerStates(ticket.branch, ticket.stack, github, raw)
            ]
          ]
    )
  )

const mergeBasesAwaitingLanding = (
  ticket: StackedTicketEntry
): ReadonlyArray<string> => [
  ...(ticket.prState === "merged" &&
  ticket.prBase !== null &&
  ticket.lastTransitionedPr !== ticket.pr
    ? [ticket.prBase]
    : []),
  ...ticket.stack.flatMap((layer) =>
    layer.prState === "merged" &&
    layer.landed !== true &&
    layer.base !== undefined
      ? [layer.base]
      : []
  )
]

const withoutIgnored = (
  ticket: Pick<TicketDocument, "ignoredBranches">,
  branch: string
): ReadonlyArray<string> =>
  (ticket.ignoredBranches ?? []).filter((ignored) => ignored !== branch)

export class TicketGit extends Context.Service<
  TicketGit,
  Readonly<{
    createBranch: (
      id: string,
      input: CreateBranchInput
    ) => Effect.Effect<
      TicketDetail,
      | TicketReadError
      | Conflict
      | BranchExists
      | BranchProtected
      | GitHubFailure,
      ProjectScope | ActivityActor
    >
    attachBranch: (
      id: string,
      input: AttachBranchInput
    ) => Effect.Effect<
      TicketDetail,
      TicketReadError | Conflict | BranchNotFound | GitHubFailure,
      ProjectScope | ActivityActor
    >
    openPr: (
      id: string,
      input: OpenPrInput
    ) => Effect.Effect<
      OpenPrResult,
      TicketReadError | Conflict | BranchProtected | GitHubFailure,
      ProjectScope | ActivityActor
    >
    clearBranch: (
      id: string
    ) => Effect.Effect<
      TicketDetail,
      TicketReadError,
      ProjectScope | ActivityActor
    >
    stackBranch: (
      id: string,
      input: AttachBranchInput
    ) => Effect.Effect<
      TicketDetail,
      TicketReadError | Conflict | BranchNotFound | GitHubFailure,
      ProjectScope | ActivityActor
    >
    unstackBranch: (
      id: string,
      input: AttachBranchInput
    ) => Effect.Effect<
      TicketDetail,
      TicketReadError | Conflict,
      ProjectScope | ActivityActor
    >
    getGitState: (
      ticketId: string | undefined,
      options?: GitStateOptions
    ) => Effect.Effect<
      GitStatesResponse,
      NotFound | MarkdownError,
      ProjectScope
    >
    listGitStates: (
      options?: GitStateOptions
    ) => Effect.Effect<
      GitStatesResponse,
      NotFound | MarkdownError,
      ProjectScope
    >
  }>
>()("@pp/server-core/tickets/TicketGit") {}

const make = Effect.gen(function* () {
  const ticketDocs = yield* TicketDocs
  const { withTicketDocumentLock, withRepositoryBranchLock } =
    yield* TicketDocumentLock.TicketDocumentLock
  const projects = yield* Projects
  const gitAutomation = yield* ProjectGitAutomation
  const ticketIndex = yield* TicketIndex
  const ticketBranchIndex = yield* TicketBranchIndex.TicketBranchIndex
  const github = yield* GitHub.GitHub
  const { gitView, detailOf, readTicket } = yield* TicketView.TicketView

  const writeGitFields = (
    indexProject: TicketProject,
    existing: TicketDocument,
    patch: {
      branch?: string | null
      branchAutoLinkDisabled?: boolean
      pr?: number | null
      prState?: TicketDocument["prState"]
      prDraft?: boolean
      prBase?: string
      lastTransitionedPr?: number | null
      stack?: ReadonlyArray<TicketBranchEntry>
      ignoredBranches?: ReadonlyArray<string>
    }
  ): Effect.Effect<TicketDocument, TicketReadError, ActivityActor> =>
    ticketDocs.update(
      indexProject.orgSlug,
      indexProject.slug,
      existing.id,
      (current) =>
        DateTime.nowAsDate.pipe(
          Effect.flatMap((updatedAt) =>
            withGitAutomation(gitAutomation, indexProject.projectId, current, {
              ...(patch.branch !== undefined && patch.branch !== current.branch
                ? Struct.omit(current, ["prBase"])
                : current),
              ...patch,
              updatedAt
            })
          )
        ),
      (next) => ticketIndex.upsertTicket(indexProject, next),
      gitAutomationActivity
    )

  const createBranch = Effect.fn("TicketGit.createBranch")(function* (
    id: string,
    input: CreateBranchInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const projectGithub = yield* projects.githubIntegration()
        if (!projectGithub) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        const baseBranch = input.baseBranch ?? projectGithub.defaultBaseBranch

        yield* github.createBranchAsUser(
          projectGithub.repoOwner,
          projectGithub.repoName,
          input.name,
          baseBranch,
          userId
        )

        const next = yield* withRepositoryBranchLock(
          projectGithub.repoId,
          writeGitFields(indexProject, ticket, {
            branch: input.name,
            branchAutoLinkDisabled: false,
            pr: null,
            prState: null,
            prDraft: false,
            lastTransitionedPr: null,
            ignoredBranches: withoutIgnored(ticket, input.name)
          })
        )
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const attachBranch = Effect.fn("TicketGit.attachBranch")(function* (
    id: string,
    input: AttachBranchInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const projectGithub = yield* projects.githubIntegration()
        if (!projectGithub) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        if ((ticket.stack ?? []).some((layer) => layer.branch === input.name)) {
          return yield* new Conflict({ reason: "branch_already_on_ticket" })
        }

        const exists = yield* github.branchExistsInstallation(
          projectGithub.installationId,
          projectGithub.repoOwner,
          projectGithub.repoName,
          input.name
        )
        if (!exists) {
          return yield* new BranchNotFound({ name: input.name })
        }

        const next = yield* withRepositoryBranchLock(
          projectGithub.repoId,
          Effect.gen(function* () {
            if (
              ticket.branch !== input.name &&
              (yield* ticketBranchIndex.isRepositoryBranchAttached(
                projectGithub.repoId,
                input.name,
                true
              ))
            ) {
              return yield* new Conflict({
                reason: "branch_on_other_ticket"
              })
            }
            return yield* writeGitFields(indexProject, ticket, {
              branch: input.name,
              branchAutoLinkDisabled: false,
              pr: null,
              prState: null,
              prDraft: false,
              lastTransitionedPr: null,
              prBase: undefined,
              ignoredBranches: withoutIgnored(ticket, input.name)
            })
          })
        )
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const openPr = Effect.fn("TicketGit.openPr")(function* (
    id: string,
    input: OpenPrInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const projectGithub = yield* projects.githubIntegration()
        if (!projectGithub) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        if (!ticket.branch) {
          return yield* new Conflict({ reason: "no_branch_on_ticket" })
        }

        const base = projectGithub.defaultBaseBranch
        const result = yield* github.openPullRequestAsUser(
          projectGithub.repoOwner,
          projectGithub.repoName,
          {
            head: ticket.branch,
            base,
            title: input.title ?? ticket.title,
            body:
              input.body ??
              `Resolves ticket ${ticket.id}: ${ticket.title}\n\n` +
                `_Tracked in ProjectProject._`,
            draft: input.draft ?? false
          },
          userId
        )

        yield* writeGitFields(indexProject, ticket, {
          pr: result.number,
          prState: "open",
          prDraft: input.draft ?? false,
          prBase: base,
          lastTransitionedPr: null
        })
        return result
      })
    )
  })

  const clearBranch = Effect.fn("TicketGit.clearBranch")(function* (
    id: string
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const ticket = yield* readTicket(orgSlug, slug, id)
        const removed = [
          ...(ticket.branch === null ? [] : [ticket.branch]),
          ...(ticket.stack ?? []).map((layer) => layer.branch)
        ]
        const next = yield* writeGitFields(indexProject, ticket, {
          branch: null,
          branchAutoLinkDisabled: true,
          pr: null,
          prState: null,
          prDraft: false,
          lastTransitionedPr: null,
          stack: [],
          ignoredBranches: [
            ...new Set([...(ticket.ignoredBranches ?? []), ...removed])
          ]
        })
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const stackBranch = Effect.fn("TicketGit.stackBranch")(function* (
    id: string,
    input: AttachBranchInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const projectGithub = yield* projects.githubIntegration()
        if (!projectGithub) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        if (!ticket.branch) {
          return yield* new Conflict({ reason: "no_branch_on_ticket" })
        }
        if (ticketBranches(ticket).has(input.name)) {
          return yield* new Conflict({ reason: "branch_already_on_ticket" })
        }
        const exists = yield* github.branchExistsInstallation(
          projectGithub.installationId,
          projectGithub.repoOwner,
          projectGithub.repoName,
          input.name
        )
        if (!exists) {
          return yield* new BranchNotFound({ name: input.name })
        }
        const snapshot = yield* github.fetchInstallationProjectStates(
          projectGithub.installationId,
          projectGithub.repoOwner,
          projectGithub.repoName,
          [input.name]
        )
        const pr = snapshot.prByBranch.get(input.name)
        const layer: TicketBranchEntry =
          pr === undefined
            ? { branch: input.name }
            : stackLayerFor({
                branch: input.name,
                base: pr.baseRefName,
                number: pr.number,
                state: pr.state,
                draft: pr.draft,
                landed: pr.baseRefName === projectGithub.defaultBaseBranch
              })
        const next = yield* withRepositoryBranchLock(
          projectGithub.repoId,
          Effect.gen(function* () {
            if (
              yield* ticketBranchIndex.isRepositoryBranchAttached(
                projectGithub.repoId,
                input.name
              )
            ) {
              return yield* new Conflict({
                reason: "branch_on_other_ticket"
              })
            }
            return yield* writeGitFields(indexProject, ticket, {
              stack: [...(ticket.stack ?? []), layer],
              ignoredBranches: withoutIgnored(ticket, input.name)
            })
          })
        )
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const unstackBranch = Effect.fn("TicketGit.unstackBranch")(function* (
    id: string,
    input: AttachBranchInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    return yield* withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = indexProjectOf(scope)
        const ticket = yield* readTicket(orgSlug, slug, id)
        const stack = ticket.stack ?? []
        if (!stack.some((layer) => layer.branch === input.name)) {
          return yield* new Conflict({ reason: "branch_not_stacked" })
        }
        const next = yield* writeGitFields(indexProject, ticket, {
          stack: stack.filter((layer) => layer.branch !== input.name),
          ignoredBranches: [...(ticket.ignoredBranches ?? []), input.name]
        })
        return yield* detailOf(next, yield* gitView)
      })
    )
  })

  const withMergeBaseChain = Effect.fn("TicketGit.withMergeBaseChain")(
    function* (
      projectGithub: ProjectGithubIntegration,
      raw: GitHub.RawProjectStates,
      requested: ReadonlyArray<string>,
      mergeBases: ReadonlyArray<string>
    ) {
      const fetched = new Set(requested)
      const existingBranches = new Set(raw.existingBranches)
      const prByBranch = new Map(raw.prByBranch)
      const mergedPrsByBranch = new Map(raw.mergedPrsByBranch)
      let frontier = mergeBases
      while (frontier.length > 0) {
        const next = [
          ...new Set(
            frontier.flatMap((branch) => {
              const selected = prByBranch.get(branch)
              const candidates = [
                ...(mergedPrsByBranch.get(branch) ?? []),
                ...(selected === undefined ? [] : [selected])
              ]
              return candidates.flatMap((pr) =>
                pr.state === "merged" &&
                pr.baseRefName !== projectGithub.defaultBaseBranch &&
                !fetched.has(pr.baseRefName)
                  ? [pr.baseRefName]
                  : []
              )
            })
          )
        ]
        if (next.length === 0) break
        const more = yield* github.fetchInstallationProjectStates(
          projectGithub.installationId,
          projectGithub.repoOwner,
          projectGithub.repoName,
          next
        )
        for (const branch of next) fetched.add(branch)
        for (const branch of more.existingBranches) existingBranches.add(branch)
        for (const [branch, pr] of more.prByBranch) {
          if (!prByBranch.has(branch)) prByBranch.set(branch, pr)
        }
        for (const [branch, history] of more.mergedPrsByBranch) {
          const combined = new Map(
            [...(mergedPrsByBranch.get(branch) ?? []), ...history].map((pr) => [
              pr.number,
              pr
            ])
          )
          mergedPrsByBranch.set(branch, [...combined.values()])
        }
        frontier = next
      }
      return {
        ...raw,
        defaultBranch: projectGithub.defaultBaseBranch,
        existingBranches,
        prByBranch,
        mergedPrsByBranch
      }
    }
  )

  const fetchGitSnapshot = Effect.fn("TicketGit.fetchGitSnapshot")(function* (
    projectGithub: ProjectGithubIntegration,
    tickets: ReadonlyArray<StackedTicketEntry>
  ) {
    const branches = [
      ...new Set(
        tickets.flatMap((ticket) => [
          ...(ticket.branch && ticket.branch.length > 0 ? [ticket.branch] : []),
          ...(ticket.stack ?? []).map((layer) => layer.branch),
          ...mergeBasesAwaitingLanding(ticket)
        ])
      )
    ]
    const mergeBases = [...new Set(tickets.flatMap(mergeBasesAwaitingLanding))]
    const discoveryTicket = tickets.find((ticket) => ticket.archivedAt === null)
    const branchQuery = discoveryTicket
      ? `${discoveryTicket.id.slice(0, discoveryTicket.id.lastIndexOf("-"))}-`
      : undefined
    return yield* github
      .fetchInstallationProjectStates(
        projectGithub.installationId,
        projectGithub.repoOwner,
        projectGithub.repoName,
        branches,
        branchQuery
      )
      .pipe(
        Effect.flatMap((raw) =>
          withMergeBaseChain(projectGithub, raw, branches, mergeBases)
        ),
        Effect.map((raw) => ({ ok: true as const, raw })),
        Effect.catchTags({
          RepoGone: () =>
            Effect.succeed({
              ok: false as const,
              tokenStatus: "ok" as const,
              repoStatus: "gone" as const
            }),
          RateLimited: (error) =>
            Effect.succeed({
              ok: false as const,
              tokenStatus: "ok" as const,
              repoStatus: "ok" as const,
              refreshStatus: "rate_limited" as const,
              retryAt: error.resetAt
            }),
          GitHubError: () =>
            Effect.succeed({
              ok: false as const,
              tokenStatus: "ok" as const,
              repoStatus: "ok" as const,
              refreshStatus: "stale" as const
            })
        })
      )
  })

  const reconcileGitStates = Effect.fn("TicketGit.reconcileGitStates")(
    function* (
      indexProject: TicketProject,
      projectGithub: ProjectGithubIntegration,
      tickets: ReadonlyArray<StackedTicketEntry>,
      raw: GitHub.RawProjectStates
    ): Effect.fn.Return<GitStatesResponse, MarkdownError> {
      const { orgSlug, slug } = indexProject
      const automaticLinks = planAutomaticBranchLinks(
        tickets,
        raw.existingBranches,
        projectGithub.defaultBaseBranch,
        raw.openPullRequestText,
        raw.prByBranch
      )
      const automaticStacks = planAutomaticStacks(
        tickets,
        automaticLinks,
        raw.existingBranches,
        projectGithub.defaultBaseBranch,
        raw.openPullRequestText,
        raw.prByBranch
      )
      const stackedTicketIds = tickets.flatMap((ticket) =>
        automaticStacks.has(ticket.id) ||
        !sameStack(ticket.stack ?? [], planStackPullRequests(ticket.stack, raw))
          ? [ticket.id]
          : []
      )
      const plannedTickets = tickets.map((ticket) => {
        const branch = automaticLinks.get(ticket.id)
        return branch
          ? {
              ...ticket,
              branch,
              pr: null,
              prState: null,
              lastTransitionedPr: null
            }
          : ticket
      })
      const plan = planTicketGitStates(
        plannedTickets,
        raw,
        yield* DateTime.nowAsDate
      )
      const indexedTickets = new Map(
        tickets.map((ticket) => [ticket.id, ticket])
      )
      const states = { ...plan.states }
      const staleTicketIds = new Set<string>()

      const resurrected = tickets.flatMap((ticket) =>
        ticket.branchDeletedAt !== null &&
        ticket.branch !== null &&
        raw.existingBranches.has(ticket.branch)
          ? [ticket.id]
          : []
      )
      const resurrectedIds = new Set(resurrected)
      const branchesById = new Map<TicketId, TicketBranches>(
        tickets.map((ticket) => [ticket.id, ticket])
      )
      const changedTicketIds = new Set<TicketId>()
      const transitioned: Array<TransitionRecord> = []
      const writesById = new Map<
        TicketId,
        Parameters<typeof writeGitFields>[2]
      >(plan.writes.map((write) => [write.ticketId, write.patch]))
      for (const [ticketId, branch] of automaticLinks) {
        writesById.set(ticketId, {
          branch,
          pr: null,
          prState: null,
          prDraft: false,
          lastTransitionedPr: null,
          ...writesById.get(ticketId)
        })
      }
      const ticketIds = new Set([
        ...writesById.keys(),
        ...resurrectedIds,
        ...stackedTicketIds
      ])

      for (const ticketId of ticketIds) {
        const automaticBranch = automaticLinks.get(ticketId)
        const automaticLayers = automaticStacks.get(ticketId) ?? []
        const reconcile = Effect.gen(function* () {
          const ticket = yield* readTicket(orgSlug, slug, ticketId).pipe(
            Effect.catchTags({
              MalformedTicketDocument: (error) =>
                Effect.logWarning("Skipping unreadable ticket for git state", {
                  orgSlug,
                  slug,
                  ticketId,
                  error
                }).pipe(Effect.as(null)),
              NotFound: () =>
                Effect.logDebug("Skipping vanished indexed ticket", {
                  orgSlug,
                  slug,
                  ticketId
                }).pipe(Effect.as(null))
            })
          )
          if (ticket === null) {
            staleTicketIds.add(ticketId)
            delete states[ticketId]
            return
          }
          const indexedTicket = indexedTickets.get(ticketId)
          if (
            indexedTicket?.branch !== ticket.branch ||
            indexedTicket.updatedAt.getTime() !== ticket.updatedAt.getTime() ||
            indexedTicket.pr !== ticket.pr ||
            indexedTicket.prState !== ticket.prState ||
            ticket.updatedAt.getTime() > raw.fetchedAt.getTime()
          ) {
            staleTicketIds.add(ticketId)
            states[ticketId] = pendingGitState(ticket, projectGithub)
            return
          }
          if (automaticBranch) {
            const attached =
              yield* ticketBranchIndex.isRepositoryBranchAttached(
                projectGithub.repoId,
                automaticBranch
              )
            if (
              ticket.branchAutoLinkDisabled ||
              (ticket.ignoredBranches ?? []).includes(automaticBranch) ||
              ticket.archivedAt !== null ||
              attached
            ) {
              staleTicketIds.add(ticketId)
              states[ticketId] = pendingGitState(ticket, projectGithub)
              return
            }
          }
          if (resurrectedIds.has(ticketId)) {
            yield* ticketBranchIndex.clearBranchStale(indexProject, [ticketId])
            changedTicketIds.add(ticketId)
          }
          const addedLayers = yield* Effect.filter(automaticLayers, (layer) =>
            Effect.map(
              ticketBranchIndex.isRepositoryBranchAttached(
                projectGithub.repoId,
                layer.branch
              ),
              (attached) => !attached
            )
          )
          const stack = [
            ...planStackPullRequests(ticket.stack, raw),
            ...addedLayers
          ]
          const planned = writesById.get(ticketId)
          const patch = sameStack(ticket.stack ?? [], stack)
            ? planned
            : { ...planned, stack }
          if (!patch) return
          const next = yield* writeGitFields(indexProject, ticket, patch).pipe(
            Effect.provideService(ActivityActor, ActivityActor.system("github"))
          )
          branchesById.set(ticketId, {
            id: ticketId,
            branch: next.branch,
            stack: next.stack ?? []
          })
          if (next.status !== ticket.status && next.pr !== null) {
            transitioned.push({
              ticketId,
              fromStatus: ticket.status,
              toStatus: next.status,
              prNumber: next.pr
            })
          }
          changedTicketIds.add(ticketId)
        })
        yield* withTicketDocumentLock(
          orgSlug,
          slug,
          ticketId,
          automaticBranch || automaticLayers.length > 0
            ? withRepositoryBranchLock(projectGithub.repoId, reconcile)
            : reconcile
        ).pipe(
          Effect.catchTags({
            NotFound: () =>
              Effect.sync(() => {
                staleTicketIds.add(ticketId)
                delete states[ticketId]
              }),
            MalformedTicketDocument: (error) =>
              Effect.logWarning("Skipping unreadable ticket for git state", {
                orgSlug,
                slug,
                ticketId,
                error
              }).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    staleTicketIds.add(ticketId)
                    delete states[ticketId]
                  })
                )
              )
          })
        )
      }

      const fetchedAt = raw.fetchedAt
      const vanishedBranches = new Set(
        tickets.flatMap((ticket) =>
          ticket.branch !== null &&
          ticket.branchDeletedAt === null &&
          ticket.updatedAt.getTime() <= fetchedAt.getTime() &&
          !raw.existingBranches.has(ticket.branch)
            ? [ticket.branch]
            : []
        )
      )
      for (const branch of vanishedBranches) {
        const deletedAt = yield* DateTime.nowAsDate
        const ticketIds = tickets
          .filter(
            (ticket) =>
              ticket.branch === branch && ticket.branchDeletedAt === null
          )
          .map((ticket) => ticket.id)
        for (const ticketId of ticketIds) {
          changedTicketIds.add(makeTicketId(ticketId))
          yield* moveForDeletedBranch(
            {
              ticketDocs,
              ticketIndex,
              gitAutomation,
              ticketDocumentLock: { withTicketDocumentLock }
            },
            { ...indexProject, ticketId, branch }
          )
        }
        yield* ticketBranchIndex.markBranchStale(
          indexProject.projectId,
          branch,
          deletedAt
        )
      }

      return {
        states,
        stacks: stacksOf(branchesById.values(), projectGithub, raw),
        refreshStatus: "fresh",
        changedTicketIds: [...changedTicketIds],
        transitioned,
        tokenStatus: "ok",
        repoStatus: "ok"
      }
    }
  )

  const listGitStates = Effect.fn("TicketGit.listGitStates")(function* (
    options: GitStateOptions = { reconcile: true }
  ): Effect.fn.Return<
    GitStatesResponse,
    NotFound | MarkdownError,
    ProjectScope
  > {
    const indexProject = indexProjectOf(yield* ProjectScope)
    const projectGithub = yield* projects.githubIntegration()

    if (!projectGithub) {
      return {
        states: {},
        transitioned: [],
        tokenStatus: "ok",
        repoStatus: "not_connected"
      }
    }

    const indexed = yield* ticketIndex.list(indexProject)
    const stacks = yield* ticketBranchIndex.stacksFor(indexProject)
    const tickets = indexed.map(
      (ticket): StackedTicketEntry =>
        Object.assign({ stack: stacks.get(ticket.id) ?? [] }, ticket)
    )
    const result = yield* fetchGitSnapshot(projectGithub, tickets)

    if (!result.ok) {
      const gone = result.repoStatus === "gone"
      return {
        states: gone
          ? {}
          : Object.fromEntries(
              tickets.map((ticket) => [
                ticket.id,
                pendingGitState(ticket, projectGithub)
              ])
            ),
        stacks: gone ? {} : stacksOf(tickets, projectGithub),
        transitioned: [],
        changedTicketIds: [],
        tokenStatus: result.tokenStatus,
        repoStatus: result.repoStatus,
        ...("refreshStatus" in result
          ? { refreshStatus: result.refreshStatus }
          : {}),
        ...("retryAt" in result ? { retryAt: result.retryAt } : {})
      }
    }

    if (result.raw.refreshStatus) {
      const snapshot = planTicketGitStates(
        tickets,
        result.raw,
        yield* DateTime.nowAsDate
      )
      return {
        states: Object.fromEntries(
          tickets.map((ticket) => [
            ticket.id,
            ticket.branch &&
            (result.raw.existingBranches.has(ticket.branch) ||
              result.raw.prByBranch.has(ticket.branch))
              ? snapshot.states[ticket.id]
              : pendingGitState(ticket, projectGithub)
          ])
        ),
        stacks: stacksOf(tickets, projectGithub, result.raw),
        transitioned: [],
        changedTicketIds: [],
        tokenStatus: "ok",
        repoStatus: "ok",
        refreshStatus: result.raw.refreshStatus,
        retryAt: result.raw.retryAt
      }
    }

    if (!options.reconcile) {
      const snapshot = planTicketGitStates(
        tickets,
        result.raw,
        yield* DateTime.nowAsDate
      )
      const planned = tickets.map((ticket) => ({
        ...ticket,
        stack: planStackPullRequests(ticket.stack, result.raw)
      }))
      return {
        states: snapshot.states,
        stacks: stacksOf(planned, projectGithub, result.raw),
        transitioned: [],
        changedTicketIds: [],
        tokenStatus: "ok",
        repoStatus: "ok"
      }
    }

    return yield* reconcileGitStates(
      indexProject,
      projectGithub,
      tickets,
      result.raw
    )
  })

  const getGitState = Effect.fn("TicketGit.getGitState")(function* (
    ticketId: string | undefined,
    options?: GitStateOptions
  ): Effect.fn.Return<
    GitStatesResponse,
    NotFound | MarkdownError,
    ProjectScope
  > {
    const all = yield* listGitStates(options)
    if (ticketId === undefined) return all
    const single = all.states[ticketId]
    const stack = all.stacks?.[ticketId]
    return {
      ...all,
      states: single ? { [ticketId]: single } : {},
      stacks: stack ? { [ticketId]: stack } : {},
      changedTicketIds: all.changedTicketIds?.filter((id) => id === ticketId),
      transitioned: all.transitioned.filter((t) => t.ticketId === ticketId)
    }
  })

  return TicketGit.of({
    createBranch,
    attachBranch,
    openPr,
    clearBranch,
    stackBranch,
    unstackBranch,
    getGitState,
    listGitStates
  })
})

export const layer = Layer.effect(TicketGit, make)
