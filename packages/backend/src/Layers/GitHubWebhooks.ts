import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "@effect/sql/SqlClient"
import { and, eq, inArray } from "drizzle-orm"
import {
  organizationGithubIntegration,
  organizationIntegration,
  projectGithubRepository,
  projectIntegrationLink
} from "../db/schema"
import { Db } from "../Services/Db"
import type { MarkdownError } from "../Services/Markdown"
import {
  GitHubWebhooks,
  type GitHubWebhookDelivery,
  type GitHubWebhookMutationSink,
  type GitHubPullRequestWebhookChange,
  type GitHubWebhooksShape
} from "../Services/GitHubWebhooks"
import { TicketDocs, type TicketDocsShape } from "../Services/TicketDocs"
import {
  bestEffortTicketIndexWrite,
  TicketIndex,
  type TicketIndexShape
} from "../Services/TicketIndex"
import { planPullRequestWebhookTicket } from "../ticketGitStatePlanner"

export interface PullRequestWebhookMatch {
  readonly orgSlug: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
  readonly ticketId: string
  readonly branch: string
}

export const applyPullRequestWebhookToTicket = (
  deps: {
    readonly ticketDocs: TicketDocsShape
    readonly ticketIndex: TicketIndexShape
  },
  match: PullRequestWebhookMatch,
  change: GitHubPullRequestWebhookChange,
  deliveryId: string | null
): Effect.Effect<void, MarkdownError> =>
  Effect.gen(function* () {
    const ticket = yield* deps.ticketDocs
      .read(match.orgSlug, match.projectSlug, match.ticketId)
      .pipe(
        Effect.catchTag("NotFound", (error) =>
          Effect.logWarning("github pull_request ticket ignored").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              deliveryId,
              orgSlug: match.orgSlug,
              slug: match.projectSlug,
              ticketId: match.ticketId,
              error
            }),
            Effect.as(null)
          )
        ),
        Effect.catchTag("MalformedTicketDocument", (error) =>
          Effect.logWarning("github pull_request ticket ignored").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              deliveryId,
              orgSlug: match.orgSlug,
              slug: match.projectSlug,
              ticketId: match.ticketId,
              error
            }),
            Effect.as(null)
          )
        )
      )
    if (!ticket) return
    if (ticket.branch !== match.branch) {
      yield* Effect.logDebug("github pull_request branch index stale").pipe(
        Effect.annotateLogs({
          module: "GitHubWebhooks",
          deliveryId,
          orgSlug: match.orgSlug,
          slug: match.projectSlug,
          ticketId: match.ticketId,
          indexedBranch: match.branch,
          ticketBranch: ticket.branch
        })
      )
      return
    }
    if (ticket.pr !== null && change.number < ticket.pr) {
      yield* Effect.logDebug("github pull_request delivery stale").pipe(
        Effect.annotateLogs({
          module: "GitHubWebhooks",
          deliveryId,
          orgSlug: match.orgSlug,
          slug: match.projectSlug,
          ticketId: match.ticketId,
          ticketPr: ticket.pr,
          webhookPr: change.number
        })
      )
      return
    }
    const write = planPullRequestWebhookTicket(ticket, change)
    if (!write) return
    const next = {
      ...ticket,
      pr: write.patch.pr !== undefined ? write.patch.pr : ticket.pr,
      prState:
        write.patch.prState !== undefined
          ? write.patch.prState
          : ticket.prState,
      lastTransitionedPr:
        write.patch.lastTransitionedPr !== undefined
          ? write.patch.lastTransitionedPr
          : ticket.lastTransitionedPr,
      status: write.patch.status ?? ticket.status,
      updatedAt: yield* DateTime.nowAsDate
    }
    yield* deps.ticketDocs
      .write(match.orgSlug, match.projectSlug, match.ticketId, next)
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("github pull_request ticket write failed").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              deliveryId,
              orgSlug: match.orgSlug,
              slug: match.projectSlug,
              ticketId: match.ticketId,
              error
            })
          )
        )
      )
    const indexProject = {
      orgSlug: match.orgSlug,
      organizationId: match.organizationId,
      projectId: match.projectId,
      projectSlug: match.projectSlug
    }
    yield* bestEffortTicketIndexWrite(
      "upsertTicket",
      indexProject,
      match.ticketId,
      deps.ticketIndex.upsertTicket(indexProject, next)
    )
  })

const GitHubId = Schema.Union(Schema.Number, Schema.String)

const InstallationPayload = Schema.Struct({
  action: Schema.String,
  installation: Schema.Struct({
    id: GitHubId
  })
})

const InstallationRepositoriesPayload = Schema.Struct({
  action: Schema.String,
  installation: Schema.Struct({
    id: GitHubId
  }),
  repositories_removed: Schema.Array(
    Schema.Struct({
      id: GitHubId
    })
  )
})

const PullRequestPayload = Schema.Struct({
  action: Schema.String,
  installation: Schema.Struct({
    id: GitHubId
  }),
  repository: Schema.Struct({
    id: GitHubId
  }),
  number: Schema.Number,
  pull_request: Schema.Struct({
    merged: Schema.Boolean,
    head: Schema.Struct({
      ref: Schema.String,
      repo: Schema.Struct({
        id: GitHubId
      })
    })
  })
})

const idToString = (id: typeof GitHubId.Type): string => String(id)

const parseJson = (body: string) =>
  Schema.decodeUnknown(Schema.parseJson())(body)

const logIgnored = (
  message: string,
  delivery: GitHubWebhookDelivery,
  extra: Record<string, unknown> = {}
) =>
  Effect.logDebug(message).pipe(
    Effect.annotateLogs({
      module: "GitHubWebhooks",
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      ...extra
    })
  )

const logMalformed = (
  delivery: GitHubWebhookDelivery,
  reason: string,
  extra: Record<string, unknown> = {}
) =>
  Effect.logWarning("github webhook payload ignored").pipe(
    Effect.annotateLogs({
      module: "GitHubWebhooks",
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      reason,
      ...extra
    })
  )

const decodePayload = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  delivery: GitHubWebhookDelivery
): Effect.Effect<A | null, never, R> =>
  Effect.gen(function* () {
    const json = yield* parseJson(delivery.body).pipe(Effect.either)
    if (json._tag === "Left") {
      yield* logMalformed(delivery, "invalid_json")
      return null
    }
    const decoded = yield* Schema.decodeUnknown(schema)(json.right).pipe(
      Effect.either
    )
    if (decoded._tag === "Left") {
      yield* logMalformed(delivery, "invalid_payload")
      return null
    }
    return decoded.right
  })

const handleInstallation = (
  sink: GitHubWebhookMutationSink,
  delivery: GitHubWebhookDelivery
) =>
  Effect.gen(function* () {
    const payload = yield* decodePayload(InstallationPayload, delivery)
    if (!payload) return
    const installationId = idToString(payload.installation.id)
    if (payload.action === "deleted") {
      yield* sink.installationDeleted(installationId, delivery.deliveryId)
      return
    }
    if (payload.action === "suspend") {
      yield* sink.installationSuspended(installationId, delivery.deliveryId)
      return
    }
    if (payload.action === "unsuspend") {
      yield* sink.installationUnsuspended(installationId, delivery.deliveryId)
      return
    }
    yield* logIgnored("github webhook action ignored", delivery, {
      action: payload.action,
      installationId
    })
  })

const handleInstallationRepositories = (
  sink: GitHubWebhookMutationSink,
  delivery: GitHubWebhookDelivery
) =>
  Effect.gen(function* () {
    const payload = yield* decodePayload(
      InstallationRepositoriesPayload,
      delivery
    )
    if (!payload) return
    const installationId = idToString(payload.installation.id)
    if (payload.action !== "removed") {
      yield* logIgnored("github webhook action ignored", delivery, {
        action: payload.action,
        installationId
      })
      return
    }
    const repoIds = payload.repositories_removed.map((repo) =>
      idToString(repo.id)
    )
    yield* sink.repositoriesRemoved(
      installationId,
      repoIds,
      delivery.deliveryId
    )
  })

const pullRequestAction = (
  action: string
): "opened" | "reopened" | "synchronize" | "closed" | null => {
  if (
    action === "opened" ||
    action === "reopened" ||
    action === "synchronize" ||
    action === "closed"
  ) {
    return action
  }
  return null
}

const handlePullRequest = (
  sink: GitHubWebhookMutationSink,
  delivery: GitHubWebhookDelivery
) =>
  Effect.gen(function* () {
    const payload = yield* decodePayload(PullRequestPayload, delivery)
    if (!payload) return
    const action = pullRequestAction(payload.action)
    const installationId = idToString(payload.installation.id)
    const repositoryId = idToString(payload.repository.id)
    if (!action) {
      yield* logIgnored("github webhook action ignored", delivery, {
        action: payload.action,
        installationId,
        repositoryId
      })
      return
    }
    const headRepoId = idToString(payload.pull_request.head.repo.id)
    if (headRepoId !== repositoryId) {
      yield* logIgnored("github pull_request from fork ignored", delivery, {
        action,
        installationId,
        repositoryId,
        headRepoId
      })
      return
    }
    yield* sink.pullRequestChanged(
      {
        installationId,
        repositoryId,
        branch: payload.pull_request.head.ref,
        number: payload.number,
        state:
          action === "closed"
            ? payload.pull_request.merged
              ? "merged"
              : "closed"
            : "open"
      },
      delivery.deliveryId
    )
  })

export const makeGitHubWebhooks = (
  sink: GitHubWebhookMutationSink
): GitHubWebhooksShape => ({
  handle: Effect.fn("GitHubWebhooks.handle")(function* (
    delivery: GitHubWebhookDelivery
  ) {
    if (delivery.event === "installation") {
      yield* handleInstallation(sink, delivery)
      return
    }
    if (delivery.event === "installation_repositories") {
      yield* handleInstallationRepositories(sink, delivery)
      return
    }
    if (delivery.event === "pull_request") {
      yield* handlePullRequest(sink, delivery)
      return
    }
    yield* logIgnored("github webhook event ignored", delivery)
  })
})

const disconnectMessage = "GitHub App installation removed"
const suspendMessage = "GitHub App installation suspended"

export const GitHubWebhooksLive = Layer.effect(
  GitHubWebhooks,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const ticketDocs = yield* TicketDocs
    const ticketIndex = yield* TicketIndex

    const installationRow = Effect.fn("GitHubWebhooks.installationRow")(
      function* (installationId: string) {
        const rows = yield* db
          .select({
            integrationId: organizationIntegration.id,
            organizationId: organizationIntegration.organizationId
          })
          .from(organizationGithubIntegration)
          .innerJoin(
            organizationIntegration,
            eq(
              organizationIntegration.id,
              organizationGithubIntegration.organizationIntegrationId
            )
          )
          .where(
            eq(organizationGithubIntegration.installationId, installationId)
          )
          .limit(1)
          .pipe(Effect.orDie)
        return rows[0] ?? null
      }
    )

    const updateProjectRepositories = (
      linkIds: ReadonlyArray<string>,
      status: "active" | "broken" | "disconnected",
      currentStatuses: ReadonlyArray<"active" | "broken" | "disconnected">
    ) =>
      linkIds.length === 0
        ? Effect.void
        : db
            .update(projectGithubRepository)
            .set({ status })
            .where(
              and(
                inArray(projectGithubRepository.projectIntegrationLinkId, [
                  ...linkIds
                ]),
                inArray(projectGithubRepository.status, [...currentStatuses])
              )
            )
            .pipe(Effect.orDie)

    const updateProjectLinks = Effect.fn("GitHubWebhooks.updateProjectLinks")(
      function* (
        integrationId: string,
        status: "active" | "broken" | "disconnected",
        currentStatuses: ReadonlyArray<"active" | "broken" | "disconnected">,
        now: Date,
        lastCheckStatus: "ok" | "error",
        lastCheckError: string | null
      ) {
        const links = yield* db
          .update(projectIntegrationLink)
          .set({
            status,
            disconnectedAt: status === "disconnected" ? now : null,
            lastCheckedAt: now,
            lastCheckStatus,
            lastCheckError,
            updatedAt: now
          })
          .where(
            and(
              eq(
                projectIntegrationLink.organizationIntegrationId,
                integrationId
              ),
              inArray(projectIntegrationLink.status, [...currentStatuses])
            )
          )
          .returning({ id: projectIntegrationLink.id })
          .pipe(Effect.orDie)
        yield* updateProjectRepositories(
          links.map((link) => link.id),
          status,
          currentStatuses
        )
      }
    )

    const updateInstallation = Effect.fn("GitHubWebhooks.updateInstallation")(
      function* (
        installationId: string,
        status: "active" | "broken" | "disconnected",
        currentStatuses: ReadonlyArray<"active" | "broken" | "disconnected">,
        message: string | null,
        deliveryId: string | null
      ) {
        const row = yield* installationRow(installationId)
        if (!row) {
          yield* Effect.logDebug("github webhook installation unknown").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              installationId,
              deliveryId
            })
          )
          return
        }
        const now = yield* DateTime.nowAsDate
        const lastCheckStatus = status === "broken" ? "error" : "ok"
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* db
                .update(organizationIntegration)
                .set({
                  status,
                  disconnectedAt: status === "disconnected" ? now : null,
                  lastCheckedAt: now,
                  lastCheckStatus,
                  lastCheckError: message,
                  updatedAt: now
                })
                .where(
                  and(
                    eq(organizationIntegration.id, row.integrationId),
                    inArray(organizationIntegration.status, [
                      ...currentStatuses
                    ])
                  )
                )
                .pipe(Effect.orDie)
              yield* updateProjectLinks(
                row.integrationId,
                status,
                currentStatuses,
                now,
                lastCheckStatus,
                message
              )
              if (status === "disconnected") {
                yield* db
                  .delete(organizationGithubIntegration)
                  .where(
                    eq(
                      organizationGithubIntegration.organizationIntegrationId,
                      row.integrationId
                    )
                  )
                  .pipe(Effect.orDie)
              }
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))
      }
    )

    const repositoriesRemoved = Effect.fn("GitHubWebhooks.repositoriesRemoved")(
      function* (
        installationId: string,
        repoIds: ReadonlyArray<string>,
        _deliveryId: string | null
      ) {
        if (repoIds.length === 0) return
        const row = yield* installationRow(installationId)
        if (!row) {
          yield* Effect.logDebug("github webhook installation unknown").pipe(
            Effect.annotateLogs({
              module: "GitHubWebhooks",
              installationId,
              deliveryId: _deliveryId
            })
          )
          return
        }
        const now = yield* DateTime.nowAsDate
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const links = yield* db
                .select({ id: projectIntegrationLink.id })
                .from(projectGithubRepository)
                .innerJoin(
                  projectIntegrationLink,
                  eq(
                    projectIntegrationLink.id,
                    projectGithubRepository.projectIntegrationLinkId
                  )
                )
                .where(
                  and(
                    eq(
                      projectIntegrationLink.organizationIntegrationId,
                      row.integrationId
                    ),
                    eq(
                      projectGithubRepository.organizationId,
                      row.organizationId
                    ),
                    inArray(projectGithubRepository.repoId, [...repoIds]),
                    inArray(projectGithubRepository.status, [
                      "active",
                      "broken"
                    ]),
                    inArray(projectIntegrationLink.status, ["active", "broken"])
                  )
                )
                .pipe(Effect.orDie)
              const linkIds = links.map((link) => link.id)
              if (linkIds.length === 0) return
              yield* db
                .update(projectIntegrationLink)
                .set({
                  status: "disconnected",
                  disconnectedAt: now,
                  lastCheckedAt: now,
                  lastCheckStatus: "ok",
                  lastCheckError: null,
                  updatedAt: now
                })
                .where(inArray(projectIntegrationLink.id, linkIds))
                .pipe(Effect.orDie)
              yield* updateProjectRepositories(linkIds, "disconnected", [
                "active",
                "broken"
              ])
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))
      }
    )

    const activeProjectLinksForRepository = Effect.fn(
      "GitHubWebhooks.activeProjectLinksForRepository"
    )(function* (change: GitHubPullRequestWebhookChange) {
      return yield* db
        .select({
          id: projectIntegrationLink.id,
          projectId: projectIntegrationLink.projectId
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
        yield* Effect.forEach(
          links,
          (link) =>
            ticketIndex.findTicketsByBranch(link.projectId, change.branch).pipe(
              Effect.flatMap((matches) =>
                matches.length === 0
                  ? Effect.logDebug("github pull_request branch unknown").pipe(
                      Effect.annotateLogs({
                        module: "GitHubWebhooks",
                        deliveryId,
                        installationId: change.installationId,
                        repositoryId: change.repositoryId,
                        branch: change.branch,
                        projectIntegrationLinkId: link.id
                      })
                    )
                  : Effect.forEach(
                      matches,
                      (match) =>
                        applyPullRequestWebhookToTicket(
                          { ticketDocs, ticketIndex },
                          match,
                          change,
                          deliveryId
                        ),
                      { concurrency: 1 }
                    ).pipe(Effect.asVoid)
              )
            ),
          { concurrency: 1 }
        )
      }
    )

    return makeGitHubWebhooks({
      installationDeleted: (installationId, deliveryId) =>
        updateInstallation(
          installationId,
          "disconnected",
          ["active", "broken"],
          disconnectMessage,
          deliveryId
        ),
      installationSuspended: (installationId, deliveryId) =>
        updateInstallation(
          installationId,
          "broken",
          ["active", "broken"],
          suspendMessage,
          deliveryId
        ),
      installationUnsuspended: (installationId, deliveryId) =>
        updateInstallation(
          installationId,
          "active",
          ["broken"],
          null,
          deliveryId
        ),
      repositoriesRemoved,
      pullRequestChanged
    })
  })
)
