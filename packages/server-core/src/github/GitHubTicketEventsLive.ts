import { Db } from "@pp/db"
import {
  organization,
  organizationGithubIntegration,
  organizationIntegration,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink
} from "@pp/db/schema"
import { ActivityActor } from "@pp/shared"
import type {
  GitHubPullRequestWebhookChange,
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"

import type { MarkdownError } from "../markdown/Markdown"
import {
  ProjectGitAutomation,
  type ProjectGitAutomationShape
} from "../projects/ProjectGitAutomation"
import {
  gitAutomationActivity,
  moveForDeletedBranch,
  withGitAutomation
} from "../tickets/moveByGitAutomation"
import {
  pickPullRequestTicket,
  pullRequestTicketReferences
} from "../tickets/pullRequestTicketReference"
import * as TicketBranchIndex from "../tickets/TicketBranchIndex"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import {
  planPullRequestPatch,
  planPullRequestWebhookTicket,
  withPullRequestBase
} from "../tickets/ticketGitStatePlanner"
import { TicketIndex, type TicketIndexShape } from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"
import {
  planLayerPullRequest,
  planStackAttach,
  replaceLayer,
  type StackPullRequest
} from "../tickets/ticketStack"
import { GitHubTicketEvents } from "./GitHubTicketEvents"
import {
  mergedPullRequestsForRepository,
  reconcilePullRequestChange,
  rememberPullRequest
} from "./pullRequestReconciliation"

export type PullRequestWebhookMatch = Readonly<{
  orgSlug: string
  organizationId: string
  projectId: string
  slug: string
  ticketId: string
  branch: string
}>

type PullRequestWebhookDeps = Readonly<{
  ticketDocs: TicketDocsShape
  ticketIndex: TicketIndexShape
  ticketBranchIndex: TicketBranchIndex.TicketBranchIndex["Service"]
  ticketDocumentLock: TicketDocumentLock.TicketDocumentLock["Service"]
  gitAutomation: ProjectGitAutomationShape
  claimPullRequest?: (
    change: GitHubPullRequestWebhookChange
  ) => Effect.Effect<boolean>
}>

type PullRequestWebhookPatch = Partial<
  Pick<
    TicketDocument,
    | "branch"
    | "pr"
    | "prState"
    | "prDraft"
    | "prBase"
    | "lastTransitionedPr"
    | "stack"
  >
>

const mergeLanded = (change: GitHubPullRequestWebhookChange): boolean =>
  change.state === "merged" &&
  (change.landed ?? change.baseBranch === change.defaultBranch)

const stackPullRequest = (
  change: GitHubPullRequestWebhookChange
): StackPullRequest => ({
  branch: change.branch,
  base: change.baseBranch,
  number: change.number,
  state: change.state,
  draft: change.draft,
  landed: mergeLanded(change)
})

const writePullRequestWebhook = (
  deps: PullRequestWebhookDeps,
  match: PullRequestWebhookMatch,
  deliveryId: string | null,
  claim: GitHubPullRequestWebhookChange | null,
  patchFor: (
    ticket: TicketDocument
  ) => Effect.Effect<PullRequestWebhookPatch | null>
): Effect.Effect<void, MarkdownError> =>
  Effect.gen(function* () {
    if (
      claim !== null &&
      deps.claimPullRequest !== undefined &&
      !(yield* deps.claimPullRequest(claim))
    )
      return
    let changed = false
    const next = yield* deps.ticketDocs
      .update(
        match.orgSlug,
        match.slug,
        match.ticketId,
        (ticket) =>
          Effect.gen(function* () {
            const patch = yield* patchFor(ticket)
            if (!patch) return ticket
            changed = true
            return yield* withGitAutomation(
              deps.gitAutomation,
              match.projectId,
              ticket,
              { ...ticket, ...patch, updatedAt: yield* DateTime.nowAsDate }
            )
          }),
        (next) =>
          changed ? deps.ticketIndex.upsertTicket(match, next) : Effect.void,
        gitAutomationActivity
      )
      .pipe(
        Effect.provideService(ActivityActor, ActivityActor.system("github")),
        Effect.catchTag(["NotFound", "MalformedTicketDocument"], (error) =>
          Effect.logWarning("github pull_request ticket ignored").pipe(
            Effect.annotateLogs({ error }),
            Effect.as(null)
          )
        ),
        Effect.tapError((error) =>
          Effect.logWarning("github pull_request ticket write failed").pipe(
            Effect.annotateLogs({ error })
          )
        )
      )
    if (next === null || !changed) return
    yield* Effect.logInfo("github pull_request ticket updated").pipe(
      Effect.annotateLogs({
        branch: next.branch,
        pr: next.pr,
        prState: next.prState,
        status: next.status
      })
    )
  }).pipe(
    Effect.annotateLogs({
      module: "GitHubWebhooks",
      deliveryId,
      orgSlug: match.orgSlug,
      slug: match.slug,
      ticketId: match.ticketId
    })
  )

export const applyPullRequestWebhookToTicket = (
  deps: PullRequestWebhookDeps,
  match: PullRequestWebhookMatch,
  change: GitHubPullRequestWebhookChange,
  deliveryId: string | null
): Effect.Effect<void, MarkdownError> =>
  deps.ticketDocumentLock.withTicketDocumentLock(
    match.orgSlug,
    match.slug,
    match.ticketId,
    writePullRequestWebhook(deps, match, deliveryId, change, (ticket) =>
      Effect.gen(function* () {
        if (ticket.branch !== match.branch) {
          yield* Effect.logDebug("github pull_request branch index stale").pipe(
            Effect.annotateLogs({
              indexedBranch: match.branch,
              ticketBranch: ticket.branch
            })
          )
          return null
        }
        if (ticket.pr !== null && change.number < ticket.pr) {
          yield* Effect.logDebug("github pull_request delivery stale").pipe(
            Effect.annotateLogs({
              ticketPr: ticket.pr,
              webhookPr: change.number
            })
          )
          return null
        }
        return withPullRequestBase(
          planPullRequestWebhookTicket(
            { ...ticket, prDraft: ticket.prDraft ?? false },
            { ...change, landed: mergeLanded(change) }
          ),
          ticket,
          { number: change.number, base: change.baseBranch }
        )
      })
    )
  )

export const applyPullRequestWebhookToLayer = (
  deps: PullRequestWebhookDeps,
  match: PullRequestWebhookMatch,
  change: GitHubPullRequestWebhookChange,
  deliveryId: string | null
): Effect.Effect<void, MarkdownError> =>
  deps.ticketDocumentLock.withTicketDocumentLock(
    match.orgSlug,
    match.slug,
    match.ticketId,
    writePullRequestWebhook(deps, match, deliveryId, change, (ticket) => {
      const layer = ticket.stack?.find(
        (candidate) => candidate.branch === match.branch
      )
      if (layer === undefined) {
        return Effect.logDebug("github pull_request stack index stale").pipe(
          Effect.annotateLogs({ branch: match.branch }),
          Effect.as(null)
        )
      }
      const next = planLayerPullRequest(layer, stackPullRequest(change))
      return Effect.succeed(
        next === null ? null : { stack: replaceLayer(ticket.stack, next) }
      )
    })
  )

const landAwaitingMerge = (
  deps: PullRequestWebhookDeps,
  match: PullRequestWebhookMatch & Readonly<{ stacked: boolean }>,
  deliveryId: string | null,
  base: Readonly<{ branch: string; mergedAt: Date }>,
  mergedAtByPr: ReadonlyMap<number, Date>
): Effect.Effect<Date | null, MarkdownError> =>
  Effect.gen(function* () {
    let landedAt: Date | null = null
    yield* deps.ticketDocumentLock.withTicketDocumentLock(
      match.orgSlug,
      match.slug,
      match.ticketId,
      writePullRequestWebhook(deps, match, deliveryId, null, (ticket) => {
        if (match.stacked) {
          const layer = ticket.stack?.find(
            (candidate) => candidate.branch === match.branch
          )
          const mergedAt =
            layer?.pr === undefined ? undefined : mergedAtByPr.get(layer.pr)
          if (
            layer?.base !== base.branch ||
            layer.prState !== "merged" ||
            layer.landed === true ||
            mergedAt === undefined ||
            mergedAt >= base.mergedAt
          )
            return Effect.succeed(null)
          landedAt = mergedAt
          return Effect.succeed({
            stack: replaceLayer(ticket.stack, { ...layer, landed: true })
          })
        }
        const mergedAt =
          ticket.pr === null ? undefined : mergedAtByPr.get(ticket.pr)
        if (
          ticket.branch !== match.branch ||
          ticket.prBase !== base.branch ||
          ticket.prState !== "merged" ||
          ticket.pr === null ||
          ticket.lastTransitionedPr === ticket.pr ||
          mergedAt === undefined ||
          mergedAt >= base.mergedAt
        )
          return Effect.succeed(null)
        landedAt = mergedAt
        return Effect.succeed({ lastTransitionedPr: ticket.pr })
      })
    )
    return landedAt
  })

export const landMergesInto = Effect.fn("GitHubWebhooks.landMergesInto")(
  function* (
    deps: PullRequestWebhookDeps,
    projectId: string,
    branch: string,
    deliveryId: string | null,
    mergedAt: Date | null,
    mergedAtByPr: ReadonlyMap<number, Date>
  ): Effect.fn.Return<void, MarkdownError> {
    if (mergedAt === null) return
    const visited = new Set([branch])
    let frontier: ReadonlyArray<Readonly<{ branch: string; mergedAt: Date }>> =
      [{ branch, mergedAt }]
    while (frontier.length > 0) {
      const next: Array<Readonly<{ branch: string; mergedAt: Date }>> = []
      for (const base of frontier) {
        const waiting = yield* deps.ticketBranchIndex.findMergesAwaiting(
          projectId,
          base.branch
        )
        for (const match of waiting) {
          if (visited.has(match.branch)) continue
          const landedAt = yield* landAwaitingMerge(
            deps,
            match,
            deliveryId,
            base,
            mergedAtByPr
          ).pipe(Effect.annotateLogs({ landedVia: base.branch }))
          if (landedAt === null) continue
          visited.add(match.branch)
          next.push({ branch: match.branch, mergedAt: landedAt })
        }
      }
      frontier = next
    }
  }
)

type PullRequestLinkSkip =
  | "closed"
  | "default_branch"
  | "no_reference"
  | "no_single_ticket"
  | "branch_attached"
  | "ticket_not_linkable"

export const linkPullRequestWebhookToTicket = Effect.fn(
  "GitHubWebhooks.linkPullRequestWebhookToTicket"
)(function* (
  deps: PullRequestWebhookDeps,
  project: TicketProject,
  change: GitHubPullRequestWebhookChange,
  deliveryId: string | null
): Effect.fn.Return<void, MarkdownError> {
  const logSkipped = (
    reason: PullRequestLinkSkip,
    extra: Readonly<{
      ticketId?: string
      mentioned?: ReadonlyArray<string>
    }> = {}
  ) =>
    Effect.logDebug("github pull_request ticket not linked").pipe(
      Effect.annotateLogs({
        module: "GitHubWebhooks",
        deliveryId,
        orgSlug: project.orgSlug,
        slug: project.slug,
        branch: change.branch,
        pr: change.number,
        reason,
        ...extra
      })
    )
  if (change.state === "closed") {
    yield* logSkipped("closed")
    return
  }
  if (change.branch === change.defaultBranch) {
    yield* logSkipped("default_branch")
    return
  }
  const references = pullRequestTicketReferences(change)
  const mentioned = references.flatMap(({ ticketIds }) => [...ticketIds])
  if (mentioned.length === 0) {
    yield* logSkipped("no_reference")
    return
  }
  const pick = pickPullRequestTicket(
    references,
    yield* deps.ticketIndex.existingIds(project, mentioned)
  )
  if (Option.isNone(pick)) {
    yield* logSkipped("no_single_ticket", { mentioned })
    return
  }
  const { ticketId, source } = pick.value
  const match = { ...project, ticketId, branch: change.branch }
  yield* deps.ticketDocumentLock.withTicketDocumentLock(
    project.orgSlug,
    project.slug,
    ticketId,
    deps.ticketDocumentLock.withRepositoryBranchLock(
      change.repositoryId,
      Effect.gen(function* () {
        if (
          yield* deps.ticketBranchIndex.isRepositoryBranchAttached(
            change.repositoryId,
            change.branch
          )
        ) {
          yield* logSkipped("branch_attached", { ticketId })
          return
        }
        yield* writePullRequestWebhook(
          deps,
          match,
          deliveryId,
          change,
          (ticket) => {
            const notLinkable = logSkipped("ticket_not_linkable", {
              ticketId
            }).pipe(Effect.as(null))
            if (ticket.archivedAt !== null) return notLinkable
            if (ticket.branch !== null) {
              const layer = planStackAttach(
                ticket,
                stackPullRequest(change),
                source === "branch"
              )
              return layer === null
                ? notLinkable
                : Effect.succeed({ stack: [...(ticket.stack ?? []), layer] })
            }
            if (
              ticket.branchAutoLinkDisabled === true ||
              (ticket.ignoredBranches ?? []).includes(change.branch)
            ) {
              return notLinkable
            }
            return Effect.succeed({
              branch: change.branch,
              prBase: change.baseBranch,
              ...planPullRequestPatch(
                {
                  ...ticket,
                  branch: change.branch,
                  pr: null,
                  prState: null,
                  prDraft: false,
                  lastTransitionedPr: null
                },
                { ...change, landed: mergeLanded(change) }
              )
            })
          }
        ).pipe(Effect.annotateLogs({ linkedFrom: source }))
      })
    )
  )
})

export const GitHubTicketEventsLive = Layer.effect(
  GitHubTicketEvents,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const ticketDocs = yield* TicketDocs
    const ticketIndex = yield* TicketIndex
    const ticketBranchIndex = yield* TicketBranchIndex.TicketBranchIndex
    const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock
    const gitAutomation = yield* ProjectGitAutomation
    const activeProjectLinksForRepository = Effect.fn(
      "GitHubWebhooks.activeProjectLinksForRepository"
    )(function* (
      change: Readonly<{
        installationId: string
        repositoryId: string
      }>
    ) {
      return yield* db
        .select({
          id: projectIntegrationLink.id,
          projectId: projectIntegrationLink.projectId,
          slug: projectIndex.slug,
          organizationId: projectIndex.organizationId,
          orgSlug: organization.slug,
          defaultBranch: projectGithubRepository.defaultBranch
        })
        .from(projectGithubRepository)
        .innerJoin(
          projectIntegrationLink,
          eq(
            projectIntegrationLink.id,
            projectGithubRepository.projectIntegrationLinkId
          )
        )
        .innerJoin(
          projectIndex,
          eq(projectIndex.id, projectIntegrationLink.projectId)
        )
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .innerJoin(
          organizationIntegration,
          eq(
            organizationIntegration.id,
            projectIntegrationLink.organizationIntegrationId
          )
        )
        .innerJoin(
          organizationGithubIntegration,
          eq(
            organizationGithubIntegration.organizationIntegrationId,
            organizationIntegration.id
          )
        )
        .where(
          and(
            eq(
              organizationGithubIntegration.installationId,
              change.installationId
            ),
            eq(projectGithubRepository.repoId, change.repositoryId),
            eq(organizationIntegration.status, "active"),
            eq(projectIntegrationLink.status, "active"),
            eq(projectGithubRepository.status, "active")
          )
        )
        .pipe(Effect.orDie)
    })

    const pullRequestChanged = Effect.fn("GitHubWebhooks.pullRequestChanged")(
      function* (
        change: GitHubPullRequestWebhookChange,
        deliveryId: string | null
      ) {
        const links = yield* activeProjectLinksForRepository(change)
        if (links.length === 0) {
          yield* Effect.logDebug("github pull_request repository unknown").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              deliveryId,
              installationId: change.installationId,
              repositoryId: change.repositoryId
            })
          )
          return
        }
        if (!(yield* rememberPullRequest(db, change))) return
        const merged = yield* mergedPullRequestsForRepository(
          db,
          change.repositoryId
        )
        const mergedAtByPr = new Map(
          merged.flatMap((pr) =>
            pr.mergedAt === null ? [] : [[pr.number, pr.mergedAt] as const]
          )
        )
        yield* Effect.forEach(
          links,
          (link) =>
            Effect.gen(function* () {
              const linkChange = reconcilePullRequestChange(
                change,
                link.defaultBranch,
                merged
              )
              const deps = {
                ticketDocs,
                ticketIndex,
                ticketBranchIndex,
                ticketDocumentLock,
                gitAutomation,
                claimPullRequest: (update: GitHubPullRequestWebhookChange) =>
                  rememberPullRequest(db, update)
              }
              const [owners, stacked] = yield* Effect.all([
                ticketBranchIndex.findTicketsByBranch(
                  link.projectId,
                  change.branch
                ),
                ticketBranchIndex.findStackLayers(link.projectId, change.branch)
              ])
              if (owners.length === 0 && stacked.length === 0) {
                yield* linkPullRequestWebhookToTicket(
                  deps,
                  link,
                  linkChange,
                  deliveryId
                ).pipe(
                  Effect.annotateLogs({
                    installationId: change.installationId,
                    repositoryId: change.repositoryId,
                    projectIntegrationLinkId: link.id
                  })
                )
              }
              yield* Effect.forEach(
                owners,
                (match) =>
                  applyPullRequestWebhookToTicket(
                    deps,
                    match,
                    linkChange,
                    deliveryId
                  ),
                { concurrency: 1, discard: true }
              )
              yield* Effect.forEach(
                stacked,
                (match) =>
                  applyPullRequestWebhookToLayer(
                    deps,
                    match,
                    linkChange,
                    deliveryId
                  ),
                { concurrency: 1, discard: true }
              )
              if (mergeLanded(linkChange)) {
                yield* landMergesInto(
                  deps,
                  link.projectId,
                  change.branch,
                  deliveryId,
                  change.mergedAt ?? null,
                  mergedAtByPr
                )
              }
            }),
          { concurrency: 1 }
        )
      }
    )

    const branchDeleted = Effect.fn("GitHubWebhooks.branchDeleted")(function* (
      change: GitHubBranchDeletionChange,
      deliveryId: string | null
    ) {
      const links = yield* activeProjectLinksForRepository(change)
      if (links.length === 0) {
        yield* Effect.logDebug("github delete repository unknown").pipe(
          Effect.annotateLogs({
            module: "GitHubWebhooks",
            deliveryId,
            installationId: change.installationId,
            repositoryId: change.repositoryId
          })
        )
        return
      }
      const now = yield* DateTime.nowAsDate
      yield* Effect.forEach(
        links,
        (link) =>
          Effect.gen(function* () {
            const matches = yield* ticketBranchIndex.findTicketsByBranch(
              link.projectId,
              change.branch
            )
            const pending = yield* Effect.filter(matches, (match) =>
              Effect.map(
                ticketBranchIndex.getBranchDeletedAt(match, match.ticketId),
                (deletedAt) => deletedAt === null
              )
            )
            yield* Effect.forEach(
              pending,
              (match) =>
                moveForDeletedBranch(
                  {
                    ticketDocs,
                    ticketIndex,
                    ticketDocumentLock,
                    gitAutomation
                  },
                  match
                ),
              { concurrency: 1, discard: true }
            )
            yield* ticketBranchIndex.markBranchStale(
              link.projectId,
              change.branch,
              now
            )
          }),
        { concurrency: 1, discard: true }
      )
    })

    const checkStateChanged = Effect.fn("GitHubWebhooks.checkStateChanged")(
      function* (change: GitHubCheckWebhookChange, deliveryId: string | null) {
        const links = yield* activeProjectLinksForRepository(change)
        if (links.length === 0) {
          yield* Effect.logDebug("github check repository unknown").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              deliveryId,
              installationId: change.installationId,
              repositoryId: change.repositoryId
            })
          )
          return
        }
        yield* sql
          .withTransaction(
            Effect.forEach(
              links,
              (link) =>
                ticketBranchIndex
                  .updateBranchChecks(
                    link.projectId,
                    change.branch,
                    change.checks,
                    change.headSha,
                    change.updatedAt
                  )
                  .pipe(
                    Effect.flatMap((ticketIds) =>
                      ticketIds.length === 0
                        ? Effect.logDebug(
                            "github check branch unknown or stale"
                          ).pipe(
                            Effect.annotateLogs({
                              module: "GitHubWebhooks",
                              deliveryId,
                              installationId: change.installationId,
                              repositoryId: change.repositoryId,
                              branch: change.branch,
                              projectIntegrationLinkId: link.id
                            })
                          )
                        : Effect.logInfo("github check state updated").pipe(
                            Effect.annotateLogs({
                              module: "GitHubWebhooks",
                              deliveryId,
                              installationId: change.installationId,
                              repositoryId: change.repositoryId,
                              branch: change.branch,
                              projectIntegrationLinkId: link.id,
                              checks: change.checks,
                              ticketIds
                            })
                          )
                    )
                  ),
              { concurrency: 1 }
            ).pipe(Effect.asVoid)
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))
      }
    )

    return GitHubTicketEvents.of({
      pullRequestChanged,
      branchDeleted,
      checkStateChanged
    })
  })
)
