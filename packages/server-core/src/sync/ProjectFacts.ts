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
  GroupHeader,
  GroupMemberFact,
  MemberFact,
  ProjectChanges,
  ProjectFact,
  ProjectScope,
  ProjectSync,
  ProjectSyncQuery,
  SnapshotPage,
  StatusFact,
  SyncChangeRef,
  SyncCursor,
  TagFact,
  TicketFact
} from "@pp/shared"
import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  lte,
  type SQL,
  sql as drizzleSql
} from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { estimateFromIndex, flagFromIndex } from "../tickets/TicketIndex"
import * as SyncLog from "./SyncLog"

export const SyncPageLimits = Context.Reference<
  Readonly<{ tickets: number; members: number; facts: number; entries: number }>
>("@pp/server-core/sync/ProjectFacts/SyncPageLimits", {
  defaultValue: () => ({
    tickets: 1000,
    members: 5000,
    facts: 2000,
    entries: 20000
  })
})

const TicketsAfter = Schema.TaggedStruct("tickets", { ticket: Schema.String })
const MembersAfter = Schema.TaggedStruct("members", {
  group: Schema.String,
  ticket: Schema.String
})

const isMembersAfter = Schema.is(MembersAfter)

const PageToken = Schema.Struct({
  generation: Schema.Finite,
  sequence: Schema.Finite,
  git: Schema.Boolean,
  after: Schema.Union([TicketsAfter, MembersAfter])
})
type PageToken = typeof PageToken.Type

const encodeToken = Schema.encodeSync(Schema.fromJsonString(PageToken))
const decodeToken = Schema.decodeUnknownOption(Schema.fromJsonString(PageToken))

export const encodeSyncCursor = (position: SyncLog.SyncPosition): SyncCursor =>
  `${position.generation}.${position.sequence}`

export const decodeSyncCursor = (
  cursor: SyncCursor
): SyncLog.SyncPosition | null => {
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
      query: ProjectSyncQuery
    ) => Effect.Effect<ProjectSync>
  }>
>()("@pp/server-core/sync/ProjectFacts") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const syncLog = yield* SyncLog.SyncLog

  const ticketsWhere = Effect.fn("ProjectFacts.ticketsWhere")(function* (
    projectId: string,
    gitVisible: boolean,
    condition: SQL | undefined,
    limit?: number
  ) {
    const selected = db
      .select()
      .from(ticketIndex)
      .where(scoped(eq(ticketIndex.projectId, projectId), condition))
      .orderBy(asc(ticketIndex.ticketId))
    const rows = yield* limit === undefined ? selected : selected.limit(limit)
    const relations =
      rows.length === 0
        ? []
        : yield* db
            .select()
            .from(ticketRelationIndex)
            .where(
              and(
                eq(ticketRelationIndex.projectId, projectId),
                inArray(
                  ticketRelationIndex.fromTicketId,
                  rows.map((row) => row.ticketId)
                )
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
              prBase: row.prBase,
              lastTransitionedPr: row.lastTransitionedPr,
              branchDeletedAt: row.branchDeletedAt,
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

  const tickets = (projectId: string, gitVisible: boolean, ids: Ids) =>
    ticketsWhere(projectId, gitVisible, only(ticketIndex.ticketId, ids))

  const groupHeaders = (projectId: string) =>
    db
      .select({
        id: groupIndex.groupId,
        kind: groupIndex.kind,
        name: groupIndex.name,
        color: groupIndex.color,
        startsAt: groupIndex.startsAt,
        endsAt: groupIndex.endsAt,
        completedAt: groupIndex.completedAt,
        createdBy: groupIndex.createdBy,
        createdAt: groupIndex.createdAt,
        updatedAt: groupIndex.updatedAt
      })
      .from(groupIndex)
      .where(eq(groupIndex.projectId, projectId))
      .pipe(Effect.map((rows): ReadonlyArray<GroupHeader> => rows))

  const groupMembers = (
    projectId: string,
    after: Readonly<{ group: string; ticket: string }> | null,
    limit: number
  ) =>
    db
      .select({
        group: groupMemberIndex.groupId,
        ticket: groupMemberIndex.ticketId,
        position: groupMemberIndex.position
      })
      .from(groupMemberIndex)
      .where(
        and(
          eq(groupMemberIndex.projectId, projectId),
          after === null
            ? undefined
            : drizzleSql`(${groupMemberIndex.groupId}, ${groupMemberIndex.ticketId}) > (${after.group}, ${after.ticket})`
        )
      )
      .orderBy(asc(groupMemberIndex.groupId), asc(groupMemberIndex.ticketId))
      .limit(limit)
      .pipe(Effect.map((rows): ReadonlyArray<GroupMemberFact> => rows))

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

  const ticketCount = (projectId: string) =>
    db
      .select({ n: count() })
      .from(ticketIndex)
      .where(eq(ticketIndex.projectId, projectId))
      .pipe(Effect.map(([row]) => row?.n ?? 0))

  const page = Effect.fn("ProjectFacts.page")(function* (
    projectId: string,
    token: PageToken,
    start: SnapshotPage["start"]
  ) {
    const limits = yield* SyncPageLimits
    const base = encodeSyncCursor(token)
    const continued = (after: PageToken["after"]) =>
      encodeToken({ ...token, after })
    if (isMembersAfter(token.after)) {
      const members = yield* groupMembers(
        projectId,
        token.after,
        limits.members
      )
      const last = members.at(-1)
      return {
        kind: "snapshot",
        base,
        git: token.git,
        start,
        tickets: [],
        groupMembers: members,
        next:
          members.length < limits.members || last === undefined
            ? null
            : continued(
                MembersAfter.make({ group: last.group, ticket: last.ticket })
              )
      } satisfies SnapshotPage
    }
    const facts = yield* ticketsWhere(
      projectId,
      token.git,
      token.after.ticket === ""
        ? undefined
        : gt(ticketIndex.ticketId, token.after.ticket),
      limits.tickets
    )
    const last = facts.at(-1)
    if (facts.length === limits.tickets && last !== undefined)
      return {
        kind: "snapshot",
        base,
        git: token.git,
        start,
        tickets: facts,
        groupMembers: [],
        next: continued(TicketsAfter.make({ ticket: last.id }))
      } satisfies SnapshotPage
    const members = yield* groupMembers(projectId, null, limits.members)
    const lastMember = members.at(-1)
    return {
      kind: "snapshot",
      base,
      git: token.git,
      start,
      tickets: facts,
      groupMembers: members,
      next:
        members.length < limits.members || lastMember === undefined
          ? null
          : continued(
              MembersAfter.make({
                group: lastMember.group,
                ticket: lastMember.ticket
              })
            )
    } satisfies SnapshotPage
  })

  const startPage = Effect.fn("ProjectFacts.startPage")(function* (
    projectId: string,
    gitVisible: boolean,
    head: SyncLog.SyncPosition
  ) {
    const start = {
      project: yield* project(projectId),
      groups: yield* groupHeaders(projectId),
      statuses: yield* statuses(projectId, undefined),
      tags: yield* tags(projectId, undefined),
      members: yield* members(projectId, undefined),
      ticketCount: yield* ticketCount(projectId)
    }
    return yield* page(
      projectId,
      { ...head, git: gitVisible, after: TicketsAfter.make({ ticket: "" }) },
      start
    )
  })

  const changedSince = (
    projectId: string,
    after: SyncLog.SyncPosition,
    head: SyncLog.SyncPosition,
    limit: number
  ) =>
    db
      .select({ sequence: syncChange.sequence, changes: syncChange.changes })
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
      .limit(limit)

  const changes = Effect.fn("ProjectFacts.changes")(function* (
    projectId: string,
    gitVisible: boolean,
    refs: ReadonlyArray<SyncChangeRef>,
    covered: SyncLog.SyncPosition,
    more: boolean
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
      cursor: encodeSyncCursor(covered),
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
      comments: idsOf(refs, "comments"),
      git: gitVisible,
      more
    } satisfies ProjectChanges
  })

  const catchUp = Effect.fn("ProjectFacts.catchUp")(function* (
    projectId: string,
    gitVisible: boolean,
    from: SyncLog.SyncPosition,
    head: SyncLog.SyncPosition
  ) {
    const limits = yield* SyncPageLimits
    const entries = yield* changedSince(projectId, from, head, limits.entries)
    const refs: Array<SyncChangeRef> = []
    const named = new Set<string>()
    let covered = from.sequence
    for (const entry of entries) {
      if (named.size >= limits.facts) break
      for (const ref of entry.changes) {
        refs.push(ref)
        named.add(`${ref.kind}:${ref.id}`)
      }
      covered = entry.sequence
    }
    return yield* changes(
      projectId,
      gitVisible,
      refs,
      { generation: head.generation, sequence: covered },
      covered < head.sequence
    )
  })

  const pull = Effect.fn("ProjectFacts.pull")(function* (
    scope: ProjectScope["Service"],
    query: ProjectSyncQuery
  ) {
    const gitVisible = scope.permissions.can({ github: ["read"] })
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`set transaction isolation level repeatable read, read only`
        const head = yield* syncLog.head(scope.projectId)
        if (query.page !== undefined) {
          const token = Option.getOrNull(decodeToken(query.page))
          return token !== null &&
            token.generation === head.generation &&
            token.sequence <= head.sequence &&
            token.git === gitVisible
            ? yield* page(scope.projectId, token, null)
            : yield* startPage(scope.projectId, gitVisible, head)
        }
        const from =
          query.after === undefined ? null : decodeSyncCursor(query.after)
        if (
          from === null ||
          from.generation !== head.generation ||
          from.sequence > head.sequence
        )
          return yield* startPage(scope.projectId, gitVisible, head)
        return yield* catchUp(scope.projectId, gitVisible, from, head)
      })
    )
  }, Effect.orDie)

  return ProjectFacts.of({ pull })
})

export const layer = Layer.effect(ProjectFacts, make)
