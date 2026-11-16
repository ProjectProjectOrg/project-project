import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  groupIndex,
  groupMemberIndex,
  organization,
  projectIndex
} from "@pp/db/schema"
import type { Group } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as SqlClient from "effect/sql/SqlClient"

import * as SyncLog from "../sync/SyncLog"

export type GroupProject = Readonly<{
  projectId: string
  orgSlug: string
  slug: string
}>

type GroupRow = typeof groupIndex.$inferInsert
type MemberRow = typeof groupMemberIndex.$inferInsert

const PUBLISH_RETRY_BASE = "50 millis"
const PUBLISH_RETRY_BUDGET = "1 second"

const groupRow = (projectId: string, group: Group): GroupRow => ({
  projectId,
  groupId: group.id,
  kind: group.kind,
  name: group.name,
  color: group.color,
  startsAt: group.startsAt,
  endsAt: group.endsAt,
  completedAt: group.completedAt,
  createdBy: group.createdBy,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt
})

const memberRows = (projectId: string, group: Group): Array<MemberRow> =>
  group.tickets.map((ticketId, position) => ({
    projectId,
    groupId: group.id,
    ticketId,
    position
  }))

const comparable = (
  groups: ReadonlyArray<GroupRow>,
  members: ReadonlyArray<MemberRow>
) =>
  JSON.stringify({
    groups: groups
      .map((row) => ({
        ...row,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }))
      .toSorted((a, b) => a.groupId.localeCompare(b.groupId)),
    members: members.toSorted(
      (a, b) =>
        a.groupId.localeCompare(b.groupId) ||
        a.position - b.position ||
        a.ticketId.localeCompare(b.ticketId)
    )
  })

export class GroupIndex extends Context.Service<
  GroupIndex,
  Readonly<{
    upsert: (orgSlug: string, slug: string, group: Group) => Effect.Effect<void>
    remove: (
      orgSlug: string,
      slug: string,
      groupId: string
    ) => Effect.Effect<void>
    rebuildProject: (
      project: GroupProject,
      groups: ReadonlyArray<Group>
    ) => Effect.Effect<boolean>
  }>
>()("@pp/server-core/groups/GroupIndex") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const syncLog = yield* SyncLog.SyncLog

  const projectIdFor = (orgSlug: string, slug: string) =>
    db
      .select({ projectId: projectIndex.id })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(organization.slug, orgSlug),
          eq(projectIndex.slug, slug),
          publishedProject()
        )
      )
      .limit(1)
      .pipe(Effect.map((rows) => rows[0]?.projectId ?? null))

  const published = <E, R>(
    orgSlug: string,
    slug: string,
    groupId: string,
    write: (projectId: string) => Effect.Effect<unknown, E, R>
  ) =>
    Effect.gen(function* () {
      const projectId = yield* projectIdFor(orgSlug, slug)
      if (projectId === null) return
      yield* sql.withTransaction(write(projectId))
    }).pipe(
      Effect.retry({
        schedule: Schedule.exponential(PUBLISH_RETRY_BASE).pipe(
          Schedule.upTo({ duration: PUBLISH_RETRY_BUDGET })
        )
      }),
      Effect.catchCause((cause) =>
        Effect.logError(
          "group index publication failed; reconciled on next start",
          cause
        ).pipe(
          Effect.annotateLogs({ module: "GroupIndex", orgSlug, slug, groupId })
        )
      )
    )

  const upsert = Effect.fn("GroupIndex.upsert")(function* (
    orgSlug: string,
    slug: string,
    group: Group
  ) {
    yield* published(orgSlug, slug, group.id, (projectId) =>
      Effect.gen(function* () {
        const row = groupRow(projectId, group)
        yield* db
          .insert(groupIndex)
          .values(row)
          .onConflictDoUpdate({
            target: [groupIndex.projectId, groupIndex.groupId],
            set: row
          })
        yield* db
          .delete(groupMemberIndex)
          .where(
            and(
              eq(groupMemberIndex.projectId, projectId),
              eq(groupMemberIndex.groupId, group.id)
            )
          )
        const members = memberRows(projectId, group)
        if (members.length > 0)
          yield* db.insert(groupMemberIndex).values(members)
        yield* syncLog.append(projectId, [
          { kind: "group", id: group.id, op: "upsert" }
        ])
      })
    )
  })

  const remove = Effect.fn("GroupIndex.remove")(function* (
    orgSlug: string,
    slug: string,
    groupId: string
  ) {
    yield* published(orgSlug, slug, groupId, (projectId) =>
      Effect.gen(function* () {
        yield* db
          .delete(groupIndex)
          .where(
            and(
              eq(groupIndex.projectId, projectId),
              eq(groupIndex.groupId, groupId)
            )
          )
        yield* syncLog.append(projectId, [
          { kind: "group", id: groupId, op: "delete" }
        ])
      })
    )
  })

  const rebuildProject = Effect.fn("GroupIndex.rebuildProject")(function* (
    project: GroupProject,
    groups: ReadonlyArray<Group>
  ) {
    const wantedGroups = groups.map((group) =>
      groupRow(project.projectId, group)
    )
    const wantedMembers = groups.flatMap((group) =>
      memberRows(project.projectId, group)
    )
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const currentGroups = yield* db
            .select()
            .from(groupIndex)
            .where(eq(groupIndex.projectId, project.projectId))
          const currentMembers = yield* db
            .select()
            .from(groupMemberIndex)
            .where(eq(groupMemberIndex.projectId, project.projectId))
          if (
            comparable(currentGroups, currentMembers) ===
            comparable(wantedGroups, wantedMembers)
          )
            return false
          yield* db
            .delete(groupIndex)
            .where(eq(groupIndex.projectId, project.projectId))
          if (wantedGroups.length > 0)
            yield* db.insert(groupIndex).values(wantedGroups)
          if (wantedMembers.length > 0)
            yield* db.insert(groupMemberIndex).values(wantedMembers)
          yield* syncLog.bumpGeneration(project.projectId)
          return true
        })
      )
      .pipe(Effect.orDie)
  })

  return GroupIndex.of({ upsert, remove, rebuildProject })
})

export const layer = Layer.effect(GroupIndex, make)
