import { Db } from "@pp/db"
import {
  groupIndex,
  groupMemberIndex,
  projectIndex,
  projectMember,
  projectStatus,
  projectTag,
  syncChange,
  ticketIndex,
  ticketRelationIndex,
  user
} from "@pp/db/schema"
import type {
  GroupFact,
  MemberFact,
  ProjectChanges,
  ProjectFact,
  ProjectScope,
  ProjectSync,
  StatusFact,
  SyncChangeRef,
  SyncCursor,
  TagFact,
  TicketFact
} from "@pp/shared"
import { and, asc, eq, gt, inArray, lte, type SQL } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import { estimateFromIndex, flagFromIndex } from "../tickets/TicketIndex"
import * as SyncLog from "./SyncLog"

export const CATCH_UP_LIMIT = 1000

export const encodeSyncCursor = (position: SyncLog.SyncPosition): SyncCursor =>
  `${position.generation}.${position.sequence}`

const decodeSyncCursor = (cursor: SyncCursor): SyncLog.SyncPosition | null => {
  const [generation, sequence, ...rest] = cursor.split(".").map(Number)
  return rest.length === 0 &&
    Number.isSafeInteger(generation) &&
    Number.isSafeInteger(sequence)
    ? { generation: generation ?? 0, sequence: sequence ?? 0 }
    : null
}

type Ids = ReadonlyArray<string> | undefined

type Resolved<F> = Readonly<{
  upserts: ReadonlyArray<F>
  deletes: ReadonlyArray<string>
}>

const idsOf = (
  refs: ReadonlyArray<SyncChangeRef>,
  kind: SyncChangeRef["kind"]
) => [...new Set(refs.flatMap((ref) => (ref.kind === kind ? [ref.id] : [])))]

const only = (column: Parameters<typeof inArray>[0], ids: Ids) =>
  ids === undefined ? undefined : inArray(column, [...ids])

const scoped = (projectCondition: SQL, idCondition: SQL | undefined) =>
  idCondition === undefined
    ? projectCondition
    : and(projectCondition, idCondition)

export class ProjectFacts extends Context.Service<
  ProjectFacts,
  Readonly<{
    pull: (
      scope: ProjectScope["Service"],
      after: SyncCursor | undefined
    ) => Effect.Effect<ProjectSync>
  }>
>()("@pp/server-core/sync/ProjectFacts") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const syncLog = yield* SyncLog.SyncLog

  const tickets = Effect.fn("ProjectFacts.tickets")(function* (
    projectId: string,
    gitVisible: boolean,
    ids: Ids
  ) {
    const rows = yield* db
      .select()
      .from(ticketIndex)
      .where(
        scoped(
          eq(ticketIndex.projectId, projectId),
          only(ticketIndex.ticketId, ids)
        )
      )
    const relations = yield* db
      .select()
      .from(ticketRelationIndex)
      .where(
        scoped(
          eq(ticketRelationIndex.projectId, projectId),
          only(ticketRelationIndex.fromTicketId, ids)
        )
      )
    const relationsOf = Arr.groupBy(relations, (row) => row.fromTicketId)
    return rows.map(
      (row): TicketFact => ({
        id: row.ticketId,
        title: row.title,
        status: row.status,
        type: row.type,
        priority: row.priority,
        rank: row.rank,
        estimate: estimateFromIndex(row.estimateUnit, row.estimateValue),
        tags: row.tags,
        assignees: row.assignees,
        parent: row.parent,
        relations: (relationsOf[row.ticketId] ?? []).map((relation) => ({
          to: relation.toTicketId,
          kind: relation.kind
        })),
        flag: flagFromIndex(row),
        git: gitVisible
          ? {
              repoId: row.repoId,
              branch: row.branch,
              pr: row.pr,
              prState: row.prState,
              prDraft: row.prDraft,
              checks: row.checks
            }
          : null,
        archivedAt: row.archivedAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })
    )
  })

  const groups = Effect.fn("ProjectFacts.groups")(function* (
    projectId: string,
    ids: Ids
  ) {
    const rows = yield* db
      .select()
      .from(groupIndex)
      .where(
        scoped(
          eq(groupIndex.projectId, projectId),
          only(groupIndex.groupId, ids)
        )
      )
    const members = yield* db
      .select()
      .from(groupMemberIndex)
      .where(
        scoped(
          eq(groupMemberIndex.projectId, projectId),
          only(groupMemberIndex.groupId, ids)
        )
      )
      .orderBy(asc(groupMemberIndex.position))
    const ticketsOf = Arr.groupBy(members, (row) => row.groupId)
    return rows.map(
      (row): GroupFact => ({
        id: row.groupId,
        kind: row.kind,
        name: row.name,
        color: row.color,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        completedAt: row.completedAt,
        tickets: (ticketsOf[row.groupId] ?? []).map((m) => m.ticketId),
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })
    )
  })

  const statuses = (projectId: string, ids: Ids) =>
    db
      .select({
        slug: projectStatus.slug,
        label: projectStatus.label,
        icon: projectStatus.icon,
        color: projectStatus.color,
        orderKey: projectStatus.orderKey,
        description: projectStatus.description
      })
      .from(projectStatus)
      .where(
        scoped(
          eq(projectStatus.projectId, projectId),
          only(projectStatus.slug, ids)
        )
      )
      .pipe(Effect.map((rows): ReadonlyArray<StatusFact> => rows))

  const tags = (projectId: string, ids: Ids) =>
    db
      .select({ name: projectTag.name, color: projectTag.color })
      .from(projectTag)
      .where(
        scoped(eq(projectTag.projectId, projectId), only(projectTag.name, ids))
      )
      .pipe(Effect.map((rows): ReadonlyArray<TagFact> => rows))

  const members = (projectId: string, ids: Ids) =>
    db
      .select({
        userId: projectMember.userId,
        role: projectMember.roleId,
        name: user.name,
        username: user.username,
        image: user.image
      })
      .from(projectMember)
      .innerJoin(user, eq(user.id, projectMember.userId))
      .where(
        scoped(
          eq(projectMember.projectId, projectId),
          only(projectMember.userId, ids)
        )
      )
      .pipe(Effect.map((rows): ReadonlyArray<MemberFact> => rows))

  const project = (projectId: string) =>
    db
      .select({
        id: projectIndex.id,
        key: projectIndex.key,
        name: projectIndex.name,
        icon: projectIndex.icon,
        color: projectIndex.color,
        estimation: projectIndex.estimation
      })
      .from(projectIndex)
      .where(eq(projectIndex.id, projectId))
      .pipe(
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.die(new Error(`project ${projectId} has no index row`))
            : Effect.succeed(row satisfies ProjectFact)
        )
      )

  const snapshot = Effect.fn("ProjectFacts.snapshot")(function* (
    projectId: string,
    gitVisible: boolean,
    head: SyncLog.SyncPosition
  ) {
    return {
      kind: "snapshot",
      cursor: encodeSyncCursor(head),
      project: yield* project(projectId),
      tickets: yield* tickets(projectId, gitVisible, undefined),
      groups: yield* groups(projectId, undefined),
      statuses: yield* statuses(projectId, undefined),
      tags: yield* tags(projectId, undefined),
      members: yield* members(projectId, undefined)
    } satisfies ProjectSync
  })

  const changedSince = (
    projectId: string,
    after: SyncLog.SyncPosition,
    head: SyncLog.SyncPosition
  ) =>
    db
      .select({ changes: syncChange.changes })
      .from(syncChange)
      .where(
        and(
          eq(syncChange.projectId, projectId),
          eq(syncChange.generation, head.generation),
          gt(syncChange.sequence, after.sequence),
          lte(syncChange.sequence, head.sequence)
        )
      )
      .orderBy(asc(syncChange.sequence))
      .limit(CATCH_UP_LIMIT + 1)

  const changes = Effect.fn("ProjectFacts.changes")(function* (
    projectId: string,
    gitVisible: boolean,
    refs: ReadonlyArray<SyncChangeRef>,
    head: SyncLog.SyncPosition
  ) {
    const resolve = <F, E>(
      ids: ReadonlyArray<string>,
      load: (ids: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<F>, E>,
      idOf: (fact: F) => string
    ) =>
      ids.length === 0
        ? Effect.succeed<Resolved<F>>({ upserts: [], deletes: [] })
        : Effect.map(load(ids), (found) => {
            const present = new Set(found.map(idOf))
            return {
              upserts: found,
              deletes: ids.filter((id) => !present.has(id))
            }
          })
    const ticketChanges = yield* resolve(
      idsOf(refs, "ticket"),
      (ids) => tickets(projectId, gitVisible, ids),
      (fact) => fact.id
    )
    const groupChanges = yield* resolve(
      idsOf(refs, "group"),
      (ids) => groups(projectId, ids),
      (fact) => fact.id
    )
    const statusChanges = yield* resolve(
      idsOf(refs, "status"),
      (ids) => statuses(projectId, ids),
      (fact) => fact.slug
    )
    const tagChanges = yield* resolve(
      idsOf(refs, "tag"),
      (ids) => tags(projectId, ids),
      (fact) => fact.name
    )
    const memberChanges = yield* resolve(
      idsOf(refs, "member"),
      (ids) => members(projectId, ids),
      (fact) => fact.userId
    )
    return {
      kind: "changes",
      cursor: encodeSyncCursor(head),
      project:
        idsOf(refs, "project").length === 0 ? null : yield* project(projectId),
      upserts: {
        tickets: ticketChanges.upserts,
        groups: groupChanges.upserts,
        statuses: statusChanges.upserts,
        tags: tagChanges.upserts,
        members: memberChanges.upserts
      },
      deletes: {
        tickets: ticketChanges.deletes,
        groups: groupChanges.deletes,
        statuses: statusChanges.deletes,
        tags: tagChanges.deletes,
        members: memberChanges.deletes
      },
      comments: idsOf(refs, "comments")
    } satisfies ProjectChanges
  })

  const pull = Effect.fn("ProjectFacts.pull")(function* (
    scope: ProjectScope["Service"],
    after: SyncCursor | undefined
  ) {
    const gitVisible = scope.permissions.can({ github: ["read"] })
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`set transaction isolation level repeatable read, read only`
        const head = yield* syncLog.head(scope.projectId)
        const from = after === undefined ? null : decodeSyncCursor(after)
        if (
          from === null ||
          from.generation !== head.generation ||
          from.sequence > head.sequence
        )
          return yield* snapshot(scope.projectId, gitVisible, head)
        const entries = yield* changedSince(scope.projectId, from, head)
        if (entries.length > CATCH_UP_LIMIT)
          return yield* snapshot(scope.projectId, gitVisible, head)
        return yield* changes(
          scope.projectId,
          gitVisible,
          entries.flatMap((entry) => entry.changes),
          head
        )
      })
    )
  }, Effect.orDie)

  return ProjectFacts.of({ pull })
})

export const layer = Layer.effect(ProjectFacts, make)
