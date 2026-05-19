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
import {
  GitHubWebhooks,
  type GitHubWebhookDelivery,
  type GitHubWebhookMutationSink,
  type GitHubWebhooksShape
} from "../Services/GitHubWebhooks"

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
      repositoriesRemoved
    })
  })
)
