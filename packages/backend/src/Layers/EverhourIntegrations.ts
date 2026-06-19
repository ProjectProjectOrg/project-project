import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "@effect/sql/SqlClient"
import { and, desc, eq, inArray } from "drizzle-orm"
import {
  DEFAULT_WORK_TYPES,
  EverhourApiKeyMissing,
  EverhourConfigMissing,
  EverhourError,
  Forbidden,
  NotFound,
  type EverhourProjectIntegrationStatus,
  type PersonalEverhour
} from "@projectproject/shared"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import {
  everhourSectionLink,
  everhourTaskLink,
  member as orgMember,
  organizationIntegration,
  projectEverhourIntegration,
  projectIndex,
  projectIntegrationLink,
  projectMember,
  userEverhourIntegration
} from "../db/schema"
import { Db } from "../Services/Db"
import { Everhour } from "../Services/Everhour"
import type {
  EverhourClientError,
  EverhourTaskPayload
} from "../Services/Everhour"
import {
  EverhourIntegrations,
  type EverhourIntegrationsShape
} from "../Services/EverhourIntegrations"
import { GroupDocs } from "../Services/GroupDocs"
import { TicketDocs } from "../Services/TicketDocs"
import { TicketIndex } from "../Services/TicketIndex"

type MutableSummary = {
  sectionsCreated: number
  sectionsUpdated: number
  sectionsArchived: number
  tasksCreated: number
  tasksUpdated: number
  tasksClosed: number
  tasksRecreated: number
  tasksSkipped: number
  errors: Array<string>
}

type ActiveLink = {
  readonly linkId: string
  readonly projectId: string
  readonly organizationId: string
  readonly linkStatus: "active" | "disconnected" | "broken"
  readonly status: "active" | "disconnected" | "broken"
  readonly everhourProjectId: string
  readonly everhourProjectName: string
  readonly backlogSectionId: string | null
  readonly lastSyncedAt: Date | null
  readonly lastSyncStatus: "ok" | "error" | null
  readonly lastSyncError: string | null
}

const emptySummary = (): MutableSummary => ({
  sectionsCreated: 0,
  sectionsUpdated: 0,
  sectionsArchived: 0,
  tasksCreated: 0,
  tasksUpdated: 0,
  tasksClosed: 0,
  tasksRecreated: 0,
  tasksSkipped: 0,
  errors: []
})

const publicBaseUrl = Effect.sync(
  () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173"
)

const encryptionKey = Effect.gen(function* () {
  const raw = process.env.USER_SECRET_ENCRYPTION_KEY
  if (!raw) {
    yield* Effect.logWarning(
      "Everhour encryption is not configured: USER_SECRET_ENCRYPTION_KEY is missing"
    )
    return yield* new EverhourConfigMissing()
  }
  const key = Buffer.from(raw, "base64")
  if (key.byteLength !== 32) {
    yield* Effect.logWarning(
      "Everhour encryption is not configured: USER_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
    )
    return yield* new EverhourConfigMissing()
  }
  return key
})

const encryptSecret = (value: string) =>
  Effect.gen(function* () {
    const key = yield* encryptionKey
    const nonce = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, nonce)
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final()
    ])
    return {
      encryptedApiKey: encrypted.toString("base64"),
      apiKeyNonce: nonce.toString("base64"),
      apiKeyTag: cipher.getAuthTag().toString("base64")
    }
  })

const decryptSecret = (row: {
  readonly encryptedApiKey: string
  readonly apiKeyNonce: string
  readonly apiKeyTag: string
}) =>
  Effect.gen(function* () {
    const key = yield* encryptionKey
    return yield* Effect.try({
      try: () => {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(row.apiKeyNonce, "base64")
        )
        decipher.setAuthTag(Buffer.from(row.apiKeyTag, "base64"))
        return Buffer.concat([
          decipher.update(Buffer.from(row.encryptedApiKey, "base64")),
          decipher.final()
        ]).toString("utf8")
      },
      catch: () => new EverhourConfigMissing()
    })
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const errorTag = (error: unknown) =>
  isRecord(error) && typeof error._tag === "string" ? error._tag : "Unknown"

const formatError = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (isRecord(error)) {
    if (typeof error.message === "string") return error.message
    if (typeof error._tag === "string") return error._tag
  }
  return String(error)
}

const typeLabel = (type: string) =>
  type === "feat" ? "type: feature" : `type: ${type}`

const managedLabels = (ticket: {
  readonly tags: ReadonlyArray<string>
  readonly type: string
  readonly status: string
  readonly priority: string
}) => [
  ...ticket.tags,
  typeLabel(ticket.type),
  `status: ${ticket.status}`,
  `priority: ${ticket.priority}`
]

const toStatus = (row: ActiveLink | null): EverhourProjectIntegrationStatus =>
  row === null
    ? {
        status: "not_connected",
        everhourProjectId: null,
        everhourProjectName: null,
        lastSyncedAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        needsSync: false
      }
    : {
        status: row.status === "active" ? "active" : "broken",
        everhourProjectId: row.everhourProjectId,
        everhourProjectName: row.everhourProjectName,
        lastSyncedAt: row.lastSyncedAt,
        lastSyncStatus: row.lastSyncStatus,
        lastSyncError: row.lastSyncError,
        needsSync: row.status !== "active" || row.lastSyncStatus === "error"
      }

const sectionForTicket = (
  ticketId: string,
  sections: ReadonlyArray<typeof everhourSectionLink.$inferSelect>,
  groups: ReadonlyArray<{
    readonly id: string
    readonly tickets: ReadonlyArray<string>
  }>
) => {
  const group = groups.find((group) => group.tickets.includes(ticketId))
  const key = group ? `sprint:${group.id}` : "backlog"
  return (
    sections.find((section) => section.localKey === key) ??
    sections.find((section) => section.localKey === "backlog")
  )
}

export const EverhourIntegrationsLive = Layer.effect(
  EverhourIntegrations,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const everhour = yield* Everhour
    const ticketDocs = yield* TicketDocs
    const ticketIndex = yield* TicketIndex
    const groupDocs = yield* GroupDocs

    const getProfile = (userId: string): Effect.Effect<PersonalEverhour> =>
      db.query.userEverhourIntegration
        .findFirst({
          columns: {
            everhourUserId: true,
            name: true,
            email: true,
            lastVerifiedAt: true,
            lastCheckError: true
          },
          where: eq(userEverhourIntegration.userId, userId)
        })
        .pipe(
          Effect.orDie,
          Effect.map((row) => ({
            connected: row !== undefined,
            everhourUserId: row?.everhourUserId ?? null,
            name: row?.name ?? null,
            email: row?.email ?? null,
            lastVerifiedAt: row?.lastVerifiedAt ?? null,
            lastCheckError: row?.lastCheckError ?? null
          }))
        )

    const actorApiKey = (userId: string) =>
      Effect.gen(function* () {
        const row = yield* db.query.userEverhourIntegration
          .findFirst({
            columns: {
              encryptedApiKey: true,
              apiKeyNonce: true,
              apiKeyTag: true,
              everhourUserId: true
            },
            where: eq(userEverhourIntegration.userId, userId)
          })
          .pipe(Effect.orDie)
        if (!row) return yield* new EverhourApiKeyMissing()
        const apiKey = yield* decryptSecret(row)
        return { apiKey, everhourUserId: row.everhourUserId }
      })

    const connectProfile = (userId: string, apiKey: string) =>
      Effect.gen(function* () {
        const verified = yield* everhour.getCurrentUser(apiKey)
        const encrypted = yield* encryptSecret(apiKey)
        const now = yield* DateTime.nowAsDate
        yield* db
          .insert(userEverhourIntegration)
          .values({
            userId,
            ...encrypted,
            everhourUserId: verified.id,
            name: verified.name,
            email: verified.email,
            connectedAt: now,
            updatedAt: now,
            lastVerifiedAt: now,
            lastCheckStatus: "ok",
            lastCheckError: null
          })
          .onConflictDoUpdate({
            target: userEverhourIntegration.userId,
            set: {
              ...encrypted,
              everhourUserId: verified.id,
              name: verified.name,
              email: verified.email,
              updatedAt: now,
              lastVerifiedAt: now,
              lastCheckStatus: "ok",
              lastCheckError: null
            }
          })
          .pipe(Effect.orDie)
        return yield* getProfile(userId)
      })

    const disconnectProfile = (userId: string) =>
      db
        .delete(userEverhourIntegration)
        .where(eq(userEverhourIntegration.userId, userId))
        .pipe(Effect.orDie, Effect.zipRight(getProfile(userId)))

    const projectRow = (orgSlug: string, slug: string) =>
      ticketIndex.projectFor(orgSlug, slug).pipe(Effect.orDie)

    const indexById = (projectId: string) =>
      db.query.projectIndex
        .findFirst({
          where: eq(projectIndex.id, projectId)
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFound())
          )
        )

    const requireMember = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        const project = yield* projectRow(orgSlug, slug)
        const explicit = yield* db.query.projectMember
          .findFirst({
            columns: { role: true },
            where: and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, userId)
            )
          })
          .pipe(Effect.orDie)
        if (explicit) return explicit.role
        const orgRole = yield* db.query.member
          .findFirst({
            columns: { role: true },
            where: and(
              eq(orgMember.organizationId, project.organizationId),
              eq(orgMember.userId, userId)
            )
          })
          .pipe(Effect.orDie)
        if (orgRole?.role === "owner" || orgRole?.role === "admin") {
          return "admin" as const
        }
        return yield* new NotFound()
      })

    const requireAdmin = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        const role = yield* requireMember(orgSlug, userId, slug)
        if (role !== "owner" && role !== "admin") {
          return yield* new Forbidden()
        }
      })

    const activeLink = (projectId: string) =>
      db
        .select({
          linkId: projectIntegrationLink.id,
          projectId: projectIntegrationLink.projectId,
          organizationId: projectIntegrationLink.organizationId,
          linkStatus: projectIntegrationLink.status,
          status: projectEverhourIntegration.status,
          everhourProjectId: projectEverhourIntegration.everhourProjectId,
          everhourProjectName: projectEverhourIntegration.everhourProjectName,
          backlogSectionId: projectEverhourIntegration.backlogSectionId,
          lastSyncedAt: projectEverhourIntegration.lastSyncedAt,
          lastSyncStatus: projectEverhourIntegration.lastSyncStatus,
          lastSyncError: projectEverhourIntegration.lastSyncError
        })
        .from(projectIntegrationLink)
        .innerJoin(
          projectEverhourIntegration,
          eq(
            projectEverhourIntegration.projectIntegrationLinkId,
            projectIntegrationLink.id
          )
        )
        .where(
          and(
            eq(projectIntegrationLink.projectId, projectId),
            eq(projectIntegrationLink.provider, "everhour"),
            inArray(projectIntegrationLink.status, ["active", "broken"])
          )
        )
        .orderBy(
          projectIntegrationLink.status,
          desc(projectIntegrationLink.updatedAt)
        )
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.map((rows) => rows[0] ?? null)
        )

    const getProjectStatus = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        yield* requireMember(orgSlug, userId, slug)
        const project = yield* projectRow(orgSlug, slug)
        const row = yield* activeLink(project.projectId)
        return toStatus(row)
      })

    const recordProjectSync = (
      linkId: string,
      status: "active" | "broken",
      actorUserId: string,
      syncStatus: "ok" | "error",
      error: string | null
    ) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        yield* db
          .update(projectIntegrationLink)
          .set({
            status,
            lastCheckStatus: syncStatus,
            lastCheckError: error,
            updatedAt: now
          })
          .where(eq(projectIntegrationLink.id, linkId))
          .pipe(Effect.orDie)
        yield* db
          .update(projectEverhourIntegration)
          .set({
            status,
            lastSyncedAt: now,
            lastSyncStatus: syncStatus,
            lastSyncError: error,
            lastSyncActorUserId: actorUserId
          })
          .where(
            eq(projectEverhourIntegration.projectIntegrationLinkId, linkId)
          )
          .pipe(Effect.orDie)
      })

    const mutate = <A>(effect: Effect.Effect<A, EverhourClientError>) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(600))
        return yield* effect.pipe(
          Effect.catchTag("EverhourRateLimited", (error) =>
            Effect.sleep(Duration.seconds(error.retryAfterSeconds)).pipe(
              Effect.zipRight(effect)
            )
          )
        )
      })

    const createOrReuseProjectLink = (
      orgSlug: string,
      userId: string,
      slug: string,
      actor: { readonly apiKey: string; readonly everhourUserId: string }
    ) =>
      Effect.gen(function* () {
        const project = yield* projectRow(orgSlug, slug)
        const existing = yield* activeLink(project.projectId)
        if (existing?.status === "active") {
          const remote = yield* everhour
            .getProject(actor.apiKey, existing.everhourProjectId)
            .pipe(Effect.either)
          if (remote._tag === "Right") return existing
          yield* Effect.logWarning(
            "Everhour existing project is unavailable; creating replacement"
          ).pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              userId,
              everhourProjectId: existing.everhourProjectId,
              errorTag: errorTag(remote.left),
              error: formatError(remote.left)
            })
          )
          yield* recordProjectSync(
            existing.linkId,
            "broken",
            userId,
            "error",
            formatError(remote.left)
          )
        }
        const index = yield* indexById(project.projectId)
        const remote = yield* mutate(
          everhour.createProject(actor.apiKey, {
            name: index.name,
            type: "board",
            users: [actor.everhourUserId]
          })
        )
        const now = yield* DateTime.nowAsDate
        const row = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const orgIntegration = yield* db.query.organizationIntegration
                .findFirst({
                  where: and(
                    eq(
                      organizationIntegration.organizationId,
                      project.organizationId
                    ),
                    eq(organizationIntegration.provider, "everhour"),
                    inArray(organizationIntegration.status, [
                      "active",
                      "broken"
                    ])
                  )
                })
                .pipe(Effect.orDie)
              const activeOrgIntegration =
                orgIntegration ??
                (yield* db
                  .insert(organizationIntegration)
                  .values({
                    organizationId: project.organizationId,
                    provider: "everhour",
                    status: "active",
                    config: { workTypes: DEFAULT_WORK_TYPES },
                    lastCheckedAt: now,
                    lastCheckStatus: "ok"
                  })
                  .returning()
                  .pipe(
                    Effect.orDie,
                    Effect.map(([created]) => created)
                  ))
              if (orgIntegration) {
                yield* db
                  .update(organizationIntegration)
                  .set({
                    status: "active",
                    config:
                      orgIntegration.config ?? { workTypes: DEFAULT_WORK_TYPES },
                    lastCheckedAt: now,
                    lastCheckStatus: "ok",
                    lastCheckError: null,
                    updatedAt: now
                  })
                  .where(eq(organizationIntegration.id, orgIntegration.id))
                  .pipe(Effect.orDie)
              }
              const [link] = yield* db
                .insert(projectIntegrationLink)
                .values({
                  projectId: project.projectId,
                  organizationId: project.organizationId,
                  organizationIntegrationId: activeOrgIntegration.id,
                  provider: "everhour",
                  status: "active",
                  lastCheckedAt: now,
                  lastCheckStatus: "ok"
                })
                .returning()
                .pipe(Effect.orDie)
              yield* db
                .insert(projectEverhourIntegration)
                .values({
                  projectIntegrationLinkId: link.id,
                  organizationId: project.organizationId,
                  status: "active",
                  everhourProjectId: remote.id,
                  everhourProjectName: remote.name,
                  lastSyncedAt: null,
                  lastSyncStatus: null
                })
                .pipe(Effect.orDie)
              return yield* activeLink(project.projectId).pipe(
                Effect.flatMap((row) =>
                  row ? Effect.succeed(row) : Effect.fail(new NotFound())
                )
              )
            })
          )
          .pipe(
            Effect.catchTag("SqlError", (error) =>
              Effect.logError("Everhour local link persistence failed").pipe(
                Effect.annotateLogs({
                  orgSlug,
                  slug,
                  userId,
                  everhourProjectId: remote.id,
                  error: formatError(error)
                }),
                Effect.zipRight(
                  Effect.fail(
                    new EverhourError({
                      message:
                        "ProjectProject could not store the Everhour link"
                    })
                  )
                )
              )
            )
          )
        return row
      })

    const syncSections = (
      apiKey: string,
      link: ActiveLink,
      summary: MutableSummary,
      orgSlug: string,
      slug: string
    ) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const ids = yield* groupDocs.listIds(orgSlug, slug).pipe(Effect.orDie)
        const groups = yield* Effect.forEach(ids, (id) =>
          groupDocs.read(orgSlug, slug, id).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null)),
            Effect.orDie
          )
        )
        const sprintSections = groups
          .filter(
            (group): group is NonNullable<(typeof groups)[number]> =>
              group !== null && group.kind === "sprint"
          )
          .map((group) => ({
            localKey: `sprint:${group.id}`,
            groupId: group.id,
            name: group.name,
            status:
              group.completedAt === null
                ? ("open" as const)
                : ("archived" as const)
          }))
        const desired = [
          {
            localKey: "backlog",
            groupId: null,
            name: "Backlog",
            status: "open" as const
          },
          ...sprintSections
        ]
        const existing = yield* db.query.everhourSectionLink
          .findMany({
            where: eq(everhourSectionLink.projectIntegrationLinkId, link.linkId)
          })
          .pipe(Effect.orDie)
        const existingByKey = new Map(
          existing.map((row) => [row.localKey, row])
        )
        for (const section of desired) {
          const row = existingByKey.get(section.localKey)
          if (!row) {
            const created = yield* mutate(
              everhour.createSection(apiKey, link.everhourProjectId, section)
            )
            yield* db
              .insert(everhourSectionLink)
              .values({
                projectIntegrationLinkId: link.linkId,
                localKey: section.localKey,
                groupId: section.groupId,
                everhourSectionId: created.id,
                name: created.name,
                status: created.status === "archived" ? "archived" : "active",
                lastSyncedAt: now
              })
              .pipe(Effect.orDie)
            if (section.localKey === "backlog") {
              yield* db
                .update(projectEverhourIntegration)
                .set({ backlogSectionId: created.id })
                .where(
                  eq(
                    projectEverhourIntegration.projectIntegrationLinkId,
                    link.linkId
                  )
                )
                .pipe(Effect.orDie)
            }
            summary.sectionsCreated++
          } else if (
            row.name !== section.name ||
            row.status !== section.status
          ) {
            const updated = yield* mutate(
              everhour.updateSection(apiKey, row.everhourSectionId, section)
            )
            yield* db
              .update(everhourSectionLink)
              .set({
                name: updated.name,
                status: updated.status === "archived" ? "archived" : "active",
                lastSyncedAt: now
              })
              .where(
                and(
                  eq(everhourSectionLink.projectIntegrationLinkId, link.linkId),
                  eq(everhourSectionLink.localKey, section.localKey)
                )
              )
              .pipe(Effect.orDie)
            summary.sectionsUpdated++
          }
        }
        const desiredKeys = new Set(desired.map((section) => section.localKey))
        for (const row of existing) {
          if (desiredKeys.has(row.localKey) || row.status === "archived") {
            continue
          }
          yield* mutate(
            everhour.updateSection(apiKey, row.everhourSectionId, {
              name: row.name,
              status: "archived"
            })
          )
          yield* db
            .update(everhourSectionLink)
            .set({ status: "archived", lastSyncedAt: now })
            .where(
              and(
                eq(everhourSectionLink.projectIntegrationLinkId, link.linkId),
                eq(everhourSectionLink.localKey, row.localKey)
              )
            )
            .pipe(Effect.orDie)
          summary.sectionsArchived++
        }
      })

    const syncTasks = (
      apiKey: string,
      link: ActiveLink,
      summary: MutableSummary,
      orgSlug: string,
      slug: string
    ) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const base = yield* publicBaseUrl
        const ticketIds = yield* ticketDocs
          .listIds(orgSlug, slug)
          .pipe(Effect.orDie)
        const groupIds = yield* groupDocs
          .listIds(orgSlug, slug)
          .pipe(Effect.orDie)
        const groups = yield* Effect.forEach(groupIds, (id) =>
          groupDocs.read(orgSlug, slug, id).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null)),
            Effect.orDie
          )
        )
        const sprints = groups.filter(
          (group): group is NonNullable<(typeof groups)[number]> =>
            group !== null && group.kind === "sprint"
        )
        const sections = yield* db.query.everhourSectionLink
          .findMany({
            where: eq(everhourSectionLink.projectIntegrationLinkId, link.linkId)
          })
          .pipe(Effect.orDie)
        for (const ticketId of ticketIds) {
          const ticket = yield* ticketDocs.read(orgSlug, slug, ticketId).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null)),
            Effect.catchTag("MalformedTicketDocument", (error) =>
              Effect.logWarning(
                "Skipping malformed ticket during Everhour sync"
              ).pipe(
                Effect.annotateLogs({ orgSlug, slug, ticketId, error }),
                Effect.as(null)
              )
            ),
            Effect.orDie
          )
          if (ticket === null) {
            summary.tasksSkipped++
            continue
          }
          const section = sectionForTicket(ticket.id, sections, sprints)
          if (!section) {
            summary.tasksSkipped++
            summary.errors.push(`No Everhour section for ${ticket.id}`)
            continue
          }
          const nextLabels = managedLabels(ticket)
          const payload = {
            name: `${ticket.title} #${ticket.id}`,
            section: section.everhourSectionId,
            labels: nextLabels,
            description: `${base}/orgs/${orgSlug}/projects/${slug}/tickets/${ticket.id}\n\n${ticket.body}`,
            status:
              ticket.status === "done" ? ("closed" as const) : ("open" as const)
          } satisfies EverhourTaskPayload
          const row = yield* db.query.everhourTaskLink
            .findFirst({
              where: and(
                eq(everhourTaskLink.projectIntegrationLinkId, link.linkId),
                eq(everhourTaskLink.ticketId, ticket.id)
              )
            })
            .pipe(Effect.orDie)
          if (!row || row.status === "local_deleted") {
            const created = yield* mutate(
              everhour.createTask(apiKey, link.everhourProjectId, payload)
            )
            yield* db
              .insert(everhourTaskLink)
              .values({
                projectIntegrationLinkId: link.linkId,
                ticketId: ticket.id,
                everhourTaskId: created.id,
                status: "active",
                lastManagedLabels: nextLabels,
                lastSyncedAt: now,
                lastSyncStatus: "ok",
                lastSyncError: null
              })
              .onConflictDoUpdate({
                target: [
                  everhourTaskLink.projectIntegrationLinkId,
                  everhourTaskLink.ticketId
                ],
                set: {
                  everhourTaskId: created.id,
                  status: "active",
                  lastManagedLabels: nextLabels,
                  lastSyncedAt: now,
                  lastSyncStatus: "ok",
                  lastSyncError: null
                }
              })
              .pipe(Effect.orDie)
            summary.tasksCreated++
            continue
          }
          const existing = yield* everhour
            .getTask(apiKey, row.everhourTaskId)
            .pipe(Effect.either)
          if (existing._tag === "Left") {
            const created = yield* mutate(
              everhour.createTask(apiKey, link.everhourProjectId, payload)
            )
            yield* db
              .update(everhourTaskLink)
              .set({
                everhourTaskId: created.id,
                status: "active",
                lastManagedLabels: nextLabels,
                lastSyncedAt: now,
                lastSyncStatus: "ok",
                lastSyncError: null
              })
              .where(
                and(
                  eq(everhourTaskLink.projectIntegrationLinkId, link.linkId),
                  eq(everhourTaskLink.ticketId, ticket.id)
                )
              )
              .pipe(Effect.orDie)
            summary.tasksRecreated++
            continue
          }
          const manualLabels = existing.right.labels.filter(
            (label) => !row.lastManagedLabels.includes(label)
          )
          const updated = yield* mutate(
            everhour.updateTask(apiKey, row.everhourTaskId, {
              ...payload,
              labels: [...manualLabels, ...nextLabels]
            })
          )
          yield* db
            .update(everhourTaskLink)
            .set({
              status: "active",
              lastManagedLabels: nextLabels,
              lastSyncedAt: now,
              lastSyncStatus: "ok",
              lastSyncError: null
            })
            .where(
              and(
                eq(everhourTaskLink.projectIntegrationLinkId, link.linkId),
                eq(everhourTaskLink.ticketId, ticket.id)
              )
            )
            .pipe(Effect.orDie)
          if (updated.status === "closed") summary.tasksClosed++
          else summary.tasksUpdated++
        }
      })

    const runFullSync = (
      orgSlug: string,
      userId: string,
      slug: string,
      createIfMissing: boolean
    ) =>
      Effect.gen(function* () {
        yield* requireAdmin(orgSlug, userId, slug)
        const actor = yield* actorApiKey(userId)
        const { apiKey } = actor
        const project = yield* projectRow(orgSlug, slug)
        const link = createIfMissing
          ? yield* createOrReuseProjectLink(orgSlug, userId, slug, actor)
          : yield* activeLink(project.projectId).pipe(
              Effect.flatMap((row) =>
                row ? Effect.succeed(row) : Effect.fail(new NotFound())
              )
            )
        const index = yield* indexById(project.projectId)
        const summary = emptySummary()
        yield* everhour
          .getProject(apiKey, link.everhourProjectId)
          .pipe(
            Effect.catchAll((error) =>
              recordProjectSync(
                link.linkId,
                "broken",
                userId,
                "error",
                formatError(error)
              ).pipe(Effect.zipRight(Effect.fail(error)))
            )
          )
        if (link.everhourProjectName !== index.name) {
          yield* mutate(
            everhour.updateProject(apiKey, link.everhourProjectId, {
              name: index.name
            })
          )
          yield* db
            .update(projectEverhourIntegration)
            .set({ everhourProjectName: index.name })
            .where(
              eq(
                projectEverhourIntegration.projectIntegrationLinkId,
                link.linkId
              )
            )
            .pipe(Effect.orDie)
        }
        yield* syncSections(apiKey, link, summary, orgSlug, slug)
        yield* syncTasks(apiKey, link, summary, orgSlug, slug)
        yield* recordProjectSync(link.linkId, "active", userId, "ok", null)
        return summary
      }).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("Everhour project sync failed").pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              userId,
              createIfMissing,
              errorTag: errorTag(error),
              error: formatError(error)
            })
          )
        ),
        Effect.tapError((error) =>
          Effect.gen(function* () {
            const project = yield* projectRow(orgSlug, slug)
            const link = yield* activeLink(project.projectId)
            if (!link) return
            yield* recordProjectSync(
              link.linkId,
              link.status === "broken" ? "broken" : "active",
              userId,
              "error",
              formatError(error)
            )
          })
        )
      )

    const disconnectProject = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        yield* requireAdmin(orgSlug, userId, slug)
        const project = yield* projectRow(orgSlug, slug)
        const link = yield* activeLink(project.projectId)
        if (link) {
          const now = yield* DateTime.nowAsDate
          yield* db
            .update(projectIntegrationLink)
            .set({
              status: "disconnected",
              disconnectedAt: now,
              updatedAt: now
            })
            .where(eq(projectIntegrationLink.id, link.linkId))
            .pipe(Effect.orDie)
          yield* db
            .update(projectEverhourIntegration)
            .set({ status: "disconnected" })
            .where(
              eq(
                projectEverhourIntegration.projectIntegrationLinkId,
                link.linkId
              )
            )
            .pipe(Effect.orDie)
        }
        return yield* getProjectStatus(orgSlug, userId, slug)
      })

    const bestEffortProjectSync = (
      orgSlug: string,
      userId: string,
      slug: string
    ) =>
      runFullSync(orgSlug, userId, slug, false).pipe(
        Effect.timeout(Duration.seconds(5)),
        Effect.catchAll((error) =>
          Effect.logWarning("Everhour best-effort sync failed").pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              userId,
              errorTag: errorTag(error),
              error: formatError(error)
            }),
            Effect.asVoid
          )
        )
      )

    const bestEffortCloseDeletedTicket = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: string
    ) =>
      Effect.gen(function* () {
        const { apiKey } = yield* actorApiKey(userId)
        const project = yield* projectRow(orgSlug, slug)
        const link = yield* activeLink(project.projectId)
        if (!link) return
        const row = yield* db.query.everhourTaskLink
          .findFirst({
            where: and(
              eq(everhourTaskLink.projectIntegrationLinkId, link.linkId),
              eq(everhourTaskLink.ticketId, ticketId)
            )
          })
          .pipe(Effect.orDie)
        if (!row) return
        const task = yield* everhour.getTask(apiKey, row.everhourTaskId)
        yield* mutate(
          everhour.updateTask(apiKey, row.everhourTaskId, {
            name: task.name,
            section: String(task.section ?? link.backlogSectionId ?? ""),
            labels: task.labels,
            description: "",
            status: "closed"
          })
        )
        yield* db
          .update(everhourTaskLink)
          .set({
            status: "local_deleted",
            lastSyncStatus: "ok",
            lastSyncError: null
          })
          .where(
            and(
              eq(everhourTaskLink.projectIntegrationLinkId, link.linkId),
              eq(everhourTaskLink.ticketId, ticketId)
            )
          )
          .pipe(Effect.orDie)
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logWarning("Everhour deleted-ticket sync failed").pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              userId,
              ticketId,
              errorTag: errorTag(error),
              error: formatError(error)
            }),
            Effect.asVoid
          )
        )
      )

    const connectProject = (orgSlug: string, userId: string, slug: string) =>
      runFullSync(orgSlug, userId, slug, true).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            const project = yield* projectRow(orgSlug, slug)
            const link = yield* activeLink(project.projectId)
            if (!link) return yield* error
            yield* Effect.logWarning(
              "Everhour project connected with incomplete initial sync"
            ).pipe(
              Effect.annotateLogs({
                orgSlug,
                slug,
                userId,
                everhourProjectId: link.everhourProjectId,
                errorTag: errorTag(error),
                error: formatError(error)
              })
            )
            return {
              ...emptySummary(),
              errors: [formatError(error)]
            }
          })
        )
      )

    return {
      getProfile,
      connectProfile,
      disconnectProfile,
      getProjectStatus,
      connectProject,
      syncProject: (orgSlug, userId, slug) =>
        runFullSync(orgSlug, userId, slug, false),
      disconnectProject,
      bestEffortProjectSync,
      bestEffortCloseDeletedTicket
    } satisfies EverhourIntegrationsShape
  })
)
