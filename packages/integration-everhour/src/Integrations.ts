import { Db } from "@pp/db"
import {
  everhourSectionLink,
  everhourWorkTypeTaskLink,
  organizationIntegration,
  projectEverhourIntegration,
  projectIntegrationLink,
  userEverhourIntegration
} from "@pp/db/schema"
import {
  DEFAULT_WORK_TYPES,
  EverhourApiKeyMissing,
  EverhourConfigMissing,
  EverhourError,
  NotFound,
  type EverhourAuthInvalid,
  type EverhourProjectIntegrationStatus,
  type EverhourRateLimited,
  type EverhourSyncSummary,
  type OrgEverhourConfig,
  type PersonalEverhour,
  ProjectScope
} from "@pp/shared"
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql as sqlText
} from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as SqlClient from "effect/sql/SqlClient"

import { EverhourApiKeys } from "./ApiKeys"
import { Everhour } from "./Client"
import type { EverhourTaskPayload } from "./Client"
import { EVERHOUR_EVENTS } from "./Events"
import { EverhourHost } from "./Host"
import { addProjectUsers } from "./ProjectUsers"

export type EverhourIntegrationError =
  | NotFound
  | EverhourApiKeyMissing
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourConfigMissing
  | EverhourError

export type EverhourIntegrationsShape = Readonly<{
  getProfile: (userId: string) => Effect.Effect<PersonalEverhour>
  connectProfile: (
    userId: string,
    apiKey: string
  ) => Effect.Effect<
    PersonalEverhour,
    | EverhourAuthInvalid
    | EverhourRateLimited
    | EverhourConfigMissing
    | EverhourError
  >
  disconnectProfile: (userId: string) => Effect.Effect<PersonalEverhour>
  getProjectStatus: () => Effect.Effect<
    EverhourProjectIntegrationStatus,
    never,
    ProjectScope
  >
  connectProject: () => Effect.Effect<
    EverhourSyncSummary,
    EverhourIntegrationError,
    ProjectScope
  >
  syncProject: () => Effect.Effect<
    EverhourSyncSummary,
    EverhourIntegrationError,
    ProjectScope
  >
  disconnectProject: () => Effect.Effect<
    EverhourProjectIntegrationStatus,
    never,
    ProjectScope
  >
  syncRequested: () => Effect.Effect<void>
  requestStaleSyncs: () => Effect.Effect<void>
}>

export class EverhourIntegrations extends Context.Service<
  EverhourIntegrations,
  EverhourIntegrationsShape
>()("@pp/integration-everhour/Integrations/EverhourIntegrations") {}

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

type ActiveLink = Readonly<{
  linkId: string
  projectId: string
  organizationId: string
  linkStatus: "active" | "disconnected" | "broken"
  status: "active" | "disconnected" | "broken"
  everhourProjectId: string
  everhourProjectName: string
  backlogSectionId: string | null
  lastSyncedAt: Date | null
  lastSyncStatus: "ok" | "error" | null
  lastSyncError: string | null
}>

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

export const workTypeTaskName = (sprintName: string, workTypeLabel: string) =>
  `${sprintName} — ${workTypeLabel}`

export type DesiredWorkTypeTask = Readonly<{
  groupId: string
  workTypeKey: string
  everhourSectionId: string
  name: string
  status: "open" | "closed"
}>

export const planWorkTypeTasks = (
  sections: ReadonlyArray<
    Readonly<{
      groupId: string | null
      name: string
      everhourSectionId: string
      status: "active" | "archived" | "broken"
    }>
  >,
  config: OrgEverhourConfig
): ReadonlyArray<DesiredWorkTypeTask> => {
  const plan: Array<DesiredWorkTypeTask> = []
  for (const section of sections) {
    if (section.groupId === null) continue
    const closed = section.status === "archived"
    for (const workType of config.workTypes) {
      plan.push({
        groupId: section.groupId,
        workTypeKey: workType.key,
        everhourSectionId: section.everhourSectionId,
        name: workTypeTaskName(section.name, workType.label),
        status: closed ? "closed" : "open"
      })
    }
  }
  return plan
}

export const workTypeTaskAction = (
  row: Readonly<{ name: string; status: string }> | undefined,
  desired: DesiredWorkTypeTask
): "create" | "update" | "noop" => {
  if (!row) return "create"
  const closed = desired.status === "closed"
  if (
    row.name !== desired.name ||
    (closed && row.status !== "archived") ||
    (!closed && row.status === "archived")
  ) {
    return "update"
  }
  return "noop"
}

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

const SYNC_LEASE = Duration.minutes(10)
const SYNC_RENEW = Duration.minutes(2)
const SYNC_RETRY = Duration.minutes(5)
export const STALE_AFTER = Duration.hours(1)
export const SWEEP_EVERY = Duration.minutes(5)

export const EverhourIntegrationsLive = Layer.effect(
  EverhourIntegrations,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* Crypto.Crypto
    const sql = yield* SqlClient.SqlClient
    const everhour = yield* Everhour
    const host = yield* EverhourHost

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
          where: {
            RAW: (table, _operators) => _operators.eq(table.userId, userId)
          }
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

    const actorApiKey = (yield* EverhourApiKeys).forUser

    const connectProfile = (userId: string, apiKey: string) =>
      Effect.gen(function* () {
        const verified = yield* everhour.getCurrentUser(apiKey)
        const sealed = yield* host.seal(apiKey)
        const encrypted = {
          encryptedApiKey: sealed.ciphertext,
          apiKeyNonce: sealed.nonce,
          apiKeyTag: sealed.tag
        }
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
        .pipe(Effect.orDie, Effect.andThen(getProfile(userId)))

    const projectRow = host.project

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

    const projectStatus = (projectId: string) =>
      activeLink(projectId).pipe(Effect.map(toStatus))

    const getProjectStatus: EverhourIntegrationsShape["getProjectStatus"] =
      () =>
        Effect.gen(function* () {
          const { projectId } = yield* ProjectScope
          return yield* projectStatus(projectId)
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
          .where(
            and(
              eq(projectIntegrationLink.id, linkId),
              inArray(projectIntegrationLink.status, ["active", "broken"])
            )
          )
          .pipe(Effect.orDie)
        yield* db
          .update(projectEverhourIntegration)
          .set({
            status,
            lastSyncedAt: now,
            lastSyncStatus: syncStatus,
            lastSyncError: error,
            ...(syncStatus === "ok"
              ? { lastSyncActorUserId: actorUserId, syncRetryAt: null }
              : {})
          })
          .where(
            and(
              eq(projectEverhourIntegration.projectIntegrationLinkId, linkId),
              inArray(projectEverhourIntegration.status, ["active", "broken"])
            )
          )
          .pipe(Effect.orDie)
      })

    const assignProjectMembers = (apiKey: string, link: ActiveLink) =>
      Effect.gen(function* () {
        const memberIds = yield* host.memberIds(link.projectId)
        const members =
          memberIds.length === 0
            ? []
            : yield* db
                .select({
                  everhourUserId: userEverhourIntegration.everhourUserId
                })
                .from(userEverhourIntegration)
                .where(inArray(userEverhourIntegration.userId, memberIds))
                .pipe(Effect.orDie)
        const team = new Set(yield* everhour.teamUserIds(apiKey))
        yield* addProjectUsers(
          { everhour, sql },
          apiKey,
          link.everhourProjectId,
          members
            .map((member) => member.everhourUserId)
            .filter((id) => team.has(id))
        )
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Everhour project member assignment failed").pipe(
            Effect.annotateLogs({
              everhourProjectId: link.everhourProjectId,
              errorTag: errorTag(error),
              error: formatError(error)
            })
          )
        )
      )

    const createOrReuseProjectLink = (
      orgSlug: string,
      userId: string,
      slug: string,
      actor: Readonly<{ apiKey: string; everhourUserId: string }>
    ) =>
      Effect.gen(function* () {
        const project = yield* projectRow(orgSlug, slug)
        const existing = yield* activeLink(project.projectId)
        if (existing?.status === "active") {
          const remote = yield* everhour
            .getProject(actor.apiKey, existing.everhourProjectId)
            .pipe(Effect.result)
          if (remote._tag === "Success") return existing
          yield* Effect.logWarning(
            "Everhour existing project is unavailable; creating replacement"
          ).pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              userId,
              everhourProjectId: existing.everhourProjectId,
              errorTag: errorTag(remote.failure),
              error: formatError(remote.failure)
            })
          )
          yield* recordProjectSync(
            existing.linkId,
            "broken",
            userId,
            "error",
            formatError(remote.failure)
          )
        }
        const name = yield* host.publishedName(project.projectId)
        const remote = yield* everhour.createProject(actor.apiKey, {
          name,
          type: "board",
          users: [actor.everhourUserId]
        })
        const now = yield* DateTime.nowAsDate
        const row = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const orgIntegration = yield* db.query.organizationIntegration
                .findFirst({
                  where: {
                    RAW: (table, _operators) =>
                      _operators.and(
                        _operators.eq(
                          table.organizationId,
                          project.organizationId
                        ),
                        _operators.eq(table.provider, "everhour"),
                        _operators.inArray(table.status, ["active", "broken"])
                      )!
                  }
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
                    config: orgIntegration.config ?? {
                      workTypes: DEFAULT_WORK_TYPES
                    },
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
                  subscribedEvents: EVERHOUR_EVENTS,
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
                Effect.andThen(
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
        const sprints = yield* host.sprints(orgSlug, slug)
        const desired = sprints.map((sprint) => ({
          localKey: `sprint:${sprint.id}`,
          groupId: sprint.id,
          name: sprint.name,
          status: sprint.completed ? ("archived" as const) : ("open" as const)
        }))
        const existing = yield* db.query.everhourSectionLink
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectIntegrationLinkId, link.linkId)
            }
          })
          .pipe(Effect.orDie)
        const existingByKey = new Map(
          existing.map((row) => [row.localKey, row])
        )
        for (const section of desired) {
          const row = existingByKey.get(section.localKey)
          if (!row) {
            const created = yield* everhour.createSection(
              apiKey,
              link.everhourProjectId,
              section
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
            summary.sectionsCreated++
          } else if (
            row.name !== section.name ||
            row.status !== section.status
          ) {
            const updated = yield* everhour.updateSection(
              apiKey,
              row.everhourSectionId,
              section
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
          yield* everhour.updateSection(apiKey, row.everhourSectionId, {
            name: row.name,
            status: "archived"
          })
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

    const syncWorkTypeTasks = (
      apiKey: string,
      link: ActiveLink,
      summary: MutableSummary,
      config: OrgEverhourConfig
    ) =>
      // FIXME: when the org-settings work-type editor lands, propagate set edits to open sprints (rename→rename, add→create, remove→archive); completed sprints stay frozen.
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const sections = yield* db.query.everhourSectionLink
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectIntegrationLinkId, link.linkId)
            }
          })
          .pipe(Effect.orDie)
        const existing = yield* db.query.everhourWorkTypeTaskLink
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectIntegrationLinkId, link.linkId)
            }
          })
          .pipe(Effect.orDie)
        const byKey = new Map(
          existing.map((row) => [`${row.groupId}:${row.workTypeKey}`, row])
        )
        for (const desired of planWorkTypeTasks(sections, config)) {
          const row = byKey.get(`${desired.groupId}:${desired.workTypeKey}`)
          const action = workTypeTaskAction(row, desired)
          if (action === "noop") continue
          const closed = desired.status === "closed"
          const payload = {
            name: desired.name,
            section: desired.everhourSectionId,
            labels: [],
            description: "",
            status: desired.status
          } satisfies EverhourTaskPayload
          if (action === "create") {
            const created = yield* everhour.createTask(
              apiKey,
              link.everhourProjectId,
              payload
            )
            yield* db
              .insert(everhourWorkTypeTaskLink)
              .values({
                projectIntegrationLinkId: link.linkId,
                groupId: desired.groupId,
                workTypeKey: desired.workTypeKey,
                everhourTaskId: created.id,
                name: created.name,
                status: closed ? "archived" : "active",
                lastSyncedAt: now
              })
              .pipe(Effect.orDie)
            summary.tasksCreated++
            continue
          }
          yield* everhour.updateTask(apiKey, row!.everhourTaskId, payload)
          yield* db
            .update(everhourWorkTypeTaskLink)
            .set({
              name: desired.name,
              status: closed ? "archived" : "active",
              lastSyncedAt: now
            })
            .where(
              and(
                eq(
                  everhourWorkTypeTaskLink.projectIntegrationLinkId,
                  link.linkId
                ),
                eq(everhourWorkTypeTaskLink.groupId, desired.groupId),
                eq(everhourWorkTypeTaskLink.workTypeKey, desired.workTypeKey)
              )
            )
            .pipe(Effect.orDie)
          if (closed) summary.tasksClosed++
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
        const name = yield* host.publishedName(project.projectId)
        const summary = emptySummary()
        yield* everhour
          .getProject(apiKey, link.everhourProjectId)
          .pipe(
            Effect.catch((error) =>
              recordProjectSync(
                link.linkId,
                "broken",
                userId,
                "error",
                formatError(error)
              ).pipe(Effect.andThen(Effect.fail(error)))
            )
          )
        if (link.everhourProjectName !== name) {
          yield* everhour.updateProject(apiKey, link.everhourProjectId, {
            name
          })
          yield* db
            .update(projectEverhourIntegration)
            .set({ everhourProjectName: name })
            .where(
              eq(
                projectEverhourIntegration.projectIntegrationLinkId,
                link.linkId
              )
            )
            .pipe(Effect.orDie)
        }
        yield* assignProjectMembers(apiKey, link)
        yield* syncSections(apiKey, link, summary, orgSlug, slug)
        const orgIntegration = yield* db.query.organizationIntegration
          .findFirst({
            columns: { config: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.organizationId, link.organizationId),
                  _operators.eq(table.provider, "everhour"),
                  _operators.inArray(table.status, ["active", "broken"])
                )!
            }
          })
          .pipe(Effect.orDie)
        const config = (orgIntegration?.config as OrgEverhourConfig | null) ?? {
          workTypes: DEFAULT_WORK_TYPES
        }
        yield* syncWorkTypeTasks(apiKey, link, summary, config)
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

    const ensureWebhook = (
      orgSlug: string,
      slug: string,
      apiKey: string,
      everhourProjectId: string,
      linkId: string
    ) =>
      Effect.gen(function* () {
        const row = yield* db.query.projectEverhourIntegration
          .findFirst({
            columns: { webhookId: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectIntegrationLinkId, linkId)
            }
          })
          .pipe(Effect.orDie)
        if (row?.webhookId) return
        const base = yield* publicBaseUrl
        const secret = Base64Url.encode(
          yield* crypto.randomBytes(24).pipe(Effect.orDie)
        )
        const created = yield* everhour.createWebhook(apiKey, {
          targetUrl: `${base}/api/integrations/everhour/webhook/${secret}`,
          project: everhourProjectId
        })
        yield* db
          .update(projectEverhourIntegration)
          .set({ webhookId: created.id, webhookSecret: secret })
          .where(
            eq(projectEverhourIntegration.projectIntegrationLinkId, linkId)
          )
          .pipe(Effect.orDie)
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Everhour webhook registration failed").pipe(
            Effect.annotateLogs({
              orgSlug,
              slug,
              errorTag: errorTag(error),
              error: formatError(error)
            }),
            Effect.asVoid
          )
        )
      )

    const deleteWebhookBestEffort = (
      apiKey: string,
      linkId: string,
      webhookId: string
    ) =>
      everhour.deleteWebhook(apiKey, webhookId).pipe(
        Effect.andThen(
          db
            .update(projectEverhourIntegration)
            .set({ webhookId: null, webhookSecret: null })
            .where(
              eq(projectEverhourIntegration.projectIntegrationLinkId, linkId)
            )
            .pipe(Effect.orDie)
        ),
        Effect.catch(() => Effect.void)
      )

    const disconnectProject: EverhourIntegrationsShape["disconnectProject"] =
      () =>
        Effect.gen(function* () {
          const { userId, projectId } = yield* ProjectScope
          const link = yield* activeLink(projectId)
          if (link) {
            const now = yield* DateTime.nowAsDate
            const integration = yield* db.query.projectEverhourIntegration
              .findFirst({
                columns: { webhookId: true },
                where: {
                  RAW: (table, _operators) =>
                    _operators.eq(table.projectIntegrationLinkId, link.linkId)
                }
              })
              .pipe(Effect.orDie)
            if (integration?.webhookId) {
              yield* actorApiKey(userId).pipe(
                Effect.flatMap((actor) =>
                  deleteWebhookBestEffort(
                    actor.apiKey,
                    link.linkId,
                    integration.webhookId!
                  )
                ),
                Effect.catch(() => Effect.void)
              )
            }
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
          return yield* projectStatus(projectId)
        })

    const updateSyncState = (
      linkId: string,
      patch: Partial<
        Pick<
          typeof projectEverhourIntegration.$inferInsert,
          "syncClaimedUntil" | "syncRetryAt"
        >
      >
    ) =>
      db
        .update(projectEverhourIntegration)
        .set(patch)
        .where(eq(projectEverhourIntegration.projectIntegrationLinkId, linkId))
        .pipe(Effect.orDie)

    const releaseClaim = (linkId: string) =>
      updateSyncState(linkId, { syncClaimedUntil: null })

    const completeSync = (linkId: string, requestedAt: string | null) =>
      Effect.gen(function* () {
        if (requestedAt !== null)
          yield* db
            .update(projectEverhourIntegration)
            .set({ syncRequestedAt: null })
            .where(
              and(
                eq(projectEverhourIntegration.projectIntegrationLinkId, linkId),
                lte(
                  projectEverhourIntegration.syncRequestedAt,
                  sqlText`${requestedAt}::timestamptz`
                )
              )
            )
            .pipe(Effect.orDie)
        yield* updateSyncState(linkId, {
          syncClaimedUntil: null,
          syncRetryAt: null
        })
      })

    const later = (duration: Duration.Duration) =>
      Effect.map(DateTime.now, (now) =>
        DateTime.toDate(DateTime.addDuration(now, duration))
      )

    const renewClaim = (linkId: string) =>
      Effect.flatMap(later(SYNC_LEASE), (until) =>
        updateSyncState(linkId, { syncClaimedUntil: until })
      )

    const deferSync = (linkId: string, duration: Duration.Duration) =>
      Effect.flatMap(later(duration), (retryAt) =>
        updateSyncState(linkId, {
          syncClaimedUntil: null,
          syncRetryAt: retryAt
        })
      )

    const claimSync = (linkId: string) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const [claimed] = yield* db
          .update(projectEverhourIntegration)
          .set({
            syncClaimedUntil: DateTime.toDate(
              DateTime.addDuration(now, SYNC_LEASE)
            )
          })
          .where(
            and(
              eq(projectEverhourIntegration.projectIntegrationLinkId, linkId),
              or(
                isNull(projectEverhourIntegration.syncClaimedUntil),
                lt(
                  projectEverhourIntegration.syncClaimedUntil,
                  DateTime.toDate(now)
                )
              )
            )
          )
          .returning({
            requestedAt: sqlText<
              string | null
            >`${projectEverhourIntegration.syncRequestedAt}::text`
          })
          .pipe(Effect.orDie)
        return claimed ?? null
      })

    const whileClaimed = <A, E>(
      linkId: string,
      requestedAt: string | null,
      retryAfter: Duration.Duration | null,
      sync: Effect.Effect<A, E>
    ) =>
      sync.pipe(
        Effect.raceFirst(
          renewClaim(linkId).pipe(Effect.delay(SYNC_RENEW), Effect.forever)
        ),
        Effect.onExit((exit) =>
          exit._tag === "Success"
            ? completeSync(linkId, requestedAt)
            : retryAfter === null
              ? releaseClaim(linkId)
              : deferSync(linkId, retryAfter)
        )
      )

    const syncLink = (
      request: Readonly<{
        linkId: string
        projectId: string
        ownerId: string | null
      }>
    ) =>
      Effect.gen(function* () {
        const claim = yield* claimSync(request.linkId)
        if (claim === null) return
        const path = yield* host.projectPath(request.projectId)
        if (request.ownerId === null || path === null) {
          yield* Effect.logWarning(
            "Everhour sync postponed: no published project or syncing manager"
          ).pipe(Effect.annotateLogs({ linkId: request.linkId }))
          return yield* deferSync(request.linkId, STALE_AFTER)
        }
        yield* whileClaimed(
          request.linkId,
          claim.requestedAt,
          SYNC_RETRY,
          runFullSync(path.orgSlug, request.ownerId, path.slug, false)
        ).pipe(Effect.ignore)
      })

    const syncProjectNow = (
      orgSlug: string,
      userId: string,
      slug: string,
      projectId: string
    ) =>
      Effect.gen(function* () {
        const link = yield* activeLink(projectId)
        if (!link) return yield* runFullSync(orgSlug, userId, slug, false)
        const claim = yield* claimSync(link.linkId).pipe(
          Effect.flatMap((claimed) =>
            claimed === null
              ? Effect.fail(
                  new EverhourError({
                    message:
                      "Another Everhour sync for this project is still running"
                  })
                )
              : Effect.succeed(claimed)
          ),
          Effect.retry({ schedule: Schedule.spaced("1 second"), times: 30 })
        )
        return yield* whileClaimed(
          link.linkId,
          claim.requestedAt,
          null,
          runFullSync(orgSlug, userId, slug, false)
        )
      })

    const syncRequested: EverhourIntegrationsShape["syncRequested"] = () =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const due = yield* db
          .select({
            linkId: projectEverhourIntegration.projectIntegrationLinkId,
            projectId: projectIntegrationLink.projectId,
            ownerId: projectEverhourIntegration.lastSyncActorUserId
          })
          .from(projectEverhourIntegration)
          .innerJoin(
            projectIntegrationLink,
            eq(
              projectIntegrationLink.id,
              projectEverhourIntegration.projectIntegrationLinkId
            )
          )
          .where(
            and(
              isNotNull(projectEverhourIntegration.syncRequestedAt),
              inArray(projectIntegrationLink.status, ["active", "broken"]),
              or(
                isNull(projectEverhourIntegration.syncClaimedUntil),
                lt(projectEverhourIntegration.syncClaimedUntil, now)
              ),
              or(
                isNull(projectEverhourIntegration.syncRetryAt),
                lt(projectEverhourIntegration.syncRetryAt, now)
              )
            )
          )
          .orderBy(projectEverhourIntegration.syncRequestedAt)
          .limit(10)
          .pipe(Effect.orDie)
        yield* Effect.forEach(due, syncLink, { concurrency: 4, discard: true })
      })

    const requestStaleSyncs: EverhourIntegrationsShape["requestStaleSyncs"] =
      () =>
        Effect.gen(function* () {
          const now = yield* DateTime.now
          yield* db
            .update(projectEverhourIntegration)
            .set({ syncRequestedAt: DateTime.toDate(now) })
            .where(
              and(
                isNull(projectEverhourIntegration.syncRequestedAt),
                isNotNull(projectEverhourIntegration.lastSyncActorUserId),
                inArray(projectEverhourIntegration.status, [
                  "active",
                  "broken"
                ]),
                or(
                  isNull(projectEverhourIntegration.lastSyncedAt),
                  lt(
                    projectEverhourIntegration.lastSyncedAt,
                    DateTime.toDate(DateTime.subtractDuration(now, STALE_AFTER))
                  )
                )
              )
            )
            .pipe(Effect.orDie)
        })

    const connectProject: EverhourIntegrationsShape["connectProject"] = () =>
      Effect.flatMap(ProjectScope, ({ orgSlug, userId, slug }) =>
        runFullSync(orgSlug, userId, slug, true).pipe(
          Effect.catch((error) =>
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
          ),
          Effect.tap(() =>
            actorApiKey(userId).pipe(
              Effect.flatMap((actor) =>
                Effect.gen(function* () {
                  const project = yield* projectRow(orgSlug, slug)
                  const link = yield* activeLink(project.projectId)
                  if (!link) return
                  yield* ensureWebhook(
                    orgSlug,
                    slug,
                    actor.apiKey,
                    link.everhourProjectId,
                    link.linkId
                  )
                })
              ),
              Effect.catch(() => Effect.void)
            )
          )
        )
      )

    return {
      getProfile,
      connectProfile,
      disconnectProfile,
      getProjectStatus,
      connectProject,
      syncProject: () =>
        Effect.flatMap(ProjectScope, ({ orgSlug, userId, slug, projectId }) =>
          syncProjectNow(orgSlug, userId, slug, projectId)
        ),
      disconnectProject,
      syncRequested,
      requestStaleSyncs
    } satisfies EverhourIntegrationsShape
  })
)
