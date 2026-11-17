import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  githubProjectSync,
  organization,
  projectIndex,
  projectIntegrationLink
} from "@pp/db/schema"
import type { GitStatesResponse } from "@pp/shared"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { nextSyncAt, type SyncLoad } from "./syncSchedule"

export type SyncStatus = Pick<
  GitStatesResponse,
  "tokenStatus" | "repoStatus" | "refreshStatus" | "retryAt"
>

export type DueProject = Readonly<{
  projectId: string
  organizationId: string
  orgSlug: string
  slug: string
}>

export type SyncOutcome = Readonly<{
  status: SyncStatus
  load: SyncLoad
  changed: boolean
}>

const failed = (status: SyncStatus) =>
  status.tokenStatus !== "ok" ||
  status.repoStatus === "gone" ||
  status.refreshStatus === "stale" ||
  status.refreshStatus === "rate_limited"

export class GitSyncSchedule extends Context.Service<
  GitSyncSchedule,
  Readonly<{
    requestSync: (projectIds: ReadonlyArray<string>) => Effect.Effect<void>
    due: (limit: number) => Effect.Effect<ReadonlyArray<DueProject>>
    recordSync: (projectId: string, outcome: SyncOutcome) => Effect.Effect<void>
    recordFailure: (projectId: string) => Effect.Effect<void>
    status: (projectId: string) => Effect.Effect<SyncStatus | null>
  }>
>()("@pp/server-core/git/GitSyncSchedule") {}

const make = Effect.gen(function* () {
  const db = yield* Db

  const current = (projectId: string) =>
    db
      .select()
      .from(githubProjectSync)
      .where(eq(githubProjectSync.projectId, projectId))
      .pipe(
        Effect.map((rows) => rows[0] ?? null),
        Effect.orDie
      )

  const requestSync = Effect.fn("GitSyncSchedule.requestSync")(function* (
    projectIds: ReadonlyArray<string>
  ) {
    if (projectIds.length === 0) return
    const now = yield* DateTime.nowAsDate
    yield* db
      .insert(githubProjectSync)
      .values(
        [...new Set(projectIds)].map((projectId) => ({
          projectId,
          nextSyncAt: now,
          lastActivityAt: now
        }))
      )
      .onConflictDoUpdate({
        target: githubProjectSync.projectId,
        set: {
          nextSyncAt: sql`least(${githubProjectSync.nextSyncAt}, excluded.next_sync_at)`,
          lastActivityAt: sql`excluded.last_activity_at`
        }
      })
      .pipe(Effect.orDie)
  })

  const due = Effect.fn("GitSyncSchedule.due")(function* (limit: number) {
    const now = yield* DateTime.nowAsDate
    return yield* db
      .selectDistinctOn([projectIndex.id], {
        projectId: projectIndex.id,
        organizationId: projectIndex.organizationId,
        orgSlug: organization.slug,
        slug: projectIndex.slug,
        nextSyncAt: githubProjectSync.nextSyncAt
      })
      .from(projectIntegrationLink)
      .innerJoin(
        projectIndex,
        eq(projectIndex.id, projectIntegrationLink.projectId)
      )
      .innerJoin(
        organization,
        and(
          eq(organization.id, projectIndex.organizationId),
          isNull(organization.deletedAt)
        )
      )
      .leftJoin(
        githubProjectSync,
        eq(githubProjectSync.projectId, projectIndex.id)
      )
      .where(
        and(
          eq(projectIntegrationLink.provider, "github"),
          eq(projectIntegrationLink.status, "active"),
          publishedProject(),
          or(
            isNull(githubProjectSync.projectId),
            lte(githubProjectSync.nextSyncAt, now)
          )
        )
      )
      .orderBy(asc(projectIndex.id))
      .pipe(
        Effect.map((rows) =>
          rows
            .toSorted(
              (a, b) =>
                (a.nextSyncAt?.getTime() ?? 0) - (b.nextSyncAt?.getTime() ?? 0)
            )
            .slice(0, limit)
            .map(({ nextSyncAt: _next, ...project }) => project)
        ),
        Effect.orDie
      )
  })

  const write = (
    projectId: string,
    values: Omit<typeof githubProjectSync.$inferInsert, "projectId">
  ) =>
    db
      .insert(githubProjectSync)
      .values({ projectId, ...values })
      .onConflictDoUpdate({ target: githubProjectSync.projectId, set: values })
      .pipe(Effect.orDie)

  const recordSync = Effect.fn("GitSyncSchedule.recordSync")(function* (
    projectId: string,
    outcome: SyncOutcome
  ) {
    const now = yield* DateTime.nowAsDate
    const previous = yield* current(projectId)
    const failures = failed(outcome.status) ? (previous?.failures ?? 0) + 1 : 0
    const lastActivityAt = outcome.changed
      ? now
      : (previous?.lastActivityAt ?? null)
    const retryAt =
      outcome.status.retryAt === undefined
        ? null
        : DateTime.toDate(DateTime.makeUnsafe(outcome.status.retryAt))
    yield* write(projectId, {
      nextSyncAt: nextSyncAt({
        now,
        load: outcome.load,
        lastActivityAt,
        failures,
        retryAt
      }),
      lastSyncedAt: now,
      lastActivityAt,
      failures,
      tokenStatus: outcome.status.tokenStatus,
      repoStatus: outcome.status.repoStatus,
      refreshStatus: outcome.status.refreshStatus ?? null,
      retryAt
    })
  })

  const recordFailure = Effect.fn("GitSyncSchedule.recordFailure")(function* (
    projectId: string
  ) {
    const now = yield* DateTime.nowAsDate
    const previous = yield* current(projectId)
    const failures = (previous?.failures ?? 0) + 1
    yield* write(projectId, {
      nextSyncAt: nextSyncAt({
        now,
        load: "settled",
        lastActivityAt: previous?.lastActivityAt ?? null,
        failures,
        retryAt: previous?.retryAt ?? null
      }),
      failures
    })
  })

  const status = Effect.fn("GitSyncSchedule.status")(function* (
    projectId: string
  ) {
    const row = yield* current(projectId)
    if (row === null || row.lastSyncedAt === null) return null
    const result: SyncStatus = {
      tokenStatus: row.tokenStatus,
      repoStatus: row.repoStatus
    }
    return Object.assign(
      result,
      row.refreshStatus === null ? null : { refreshStatus: row.refreshStatus },
      row.retryAt === null ? null : { retryAt: row.retryAt.getTime() }
    )
  })

  return GitSyncSchedule.of({
    requestSync,
    due,
    recordSync,
    recordFailure,
    status
  })
})

export const layer = Layer.effect(GitSyncSchedule, make)
