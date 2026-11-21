import { GroupPolicy } from "@pp/access/policies"
import {
  type ActivityActor,
  type ActivityCause,
  type CompleteSprintInput,
  type CompleteSprintOutput,
  GroupId,
  type CreateGroupInput,
  type CursorPayload,
  Group,
  type GroupDetail,
  type GroupFilter,
  NotFound,
  SprintCompletedImmutable,
  type SprintSnapshotTicket,
  type SprintState,
  TicketId,
  type UpdateGroupInput,
  type UpdateGroupTicketsInput,
  UpdateGroupTicketsOutput,
  ProjectScope,
  Forbidden,
  GroupColor,
  GroupKind,
  isCarryover,
  paginateSorted,
  padNumericIdSort,
  sprintState,
  TAG_DEFAULT_PALETTE,
  isEpic,
  HierarchyInvalid,
  SprintInvalid,
  TicketChanged
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import * as KeyedLock from "../locks/KeyedLock"
import type * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"
import * as GroupDocs from "./GroupDocs"
import type { SprintFiles } from "./sprintMembership"

export type SprintMembershipOptions = Readonly<{
  from?: GroupId | null
}>

export class Groups extends Context.Service<
  Groups,
  Readonly<{
    list: () => Effect.Effect<
      ReadonlyArray<Group>,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    listPaged: (
      filter: GroupFilter | undefined,
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      { items: ReadonlyArray<Group>; nextCursor: string | null },
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    listSprintsPaged: (
      state: SprintState | undefined,
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      { items: ReadonlyArray<Group>; nextCursor: string | null },
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    documents: () => Effect.Effect<
      ReadonlyArray<GroupDocs.GroupDocument>,
      Markdown.MarkdownError,
      ProjectScope
    >
    get: (
      id: string
    ) => Effect.Effect<
      GroupDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    create: (
      input: CreateGroupInput
    ) => Effect.Effect<
      Group,
      | Forbidden
      | NotFound
      | SprintInvalid
      | HierarchyInvalid
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    update: (
      id: string,
      input: UpdateGroupInput
    ) => Effect.Effect<
      GroupDetail,
      Forbidden | NotFound | SprintInvalid | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    updateTickets: (
      id: string,
      input: UpdateGroupTicketsInput
    ) => Effect.Effect<
      UpdateGroupTicketsOutput,
      | Forbidden
      | NotFound
      | SprintCompletedImmutable
      | SprintInvalid
      | HierarchyInvalid
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    addTickets: (
      id: string,
      ticketIds: ReadonlyArray<TicketId>
    ) => Effect.Effect<
      UpdateGroupTicketsOutput,
      | Forbidden
      | NotFound
      | SprintCompletedImmutable
      | SprintInvalid
      | HierarchyInvalid
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    removeTickets: (
      id: string,
      ticketIds: ReadonlyArray<TicketId>
    ) => Effect.Effect<
      UpdateGroupTicketsOutput,
      Forbidden | NotFound | SprintCompletedImmutable | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    complete: (
      id: string,
      input: CompleteSprintInput
    ) => Effect.Effect<
      CompleteSprintOutput,
      | Forbidden
      | NotFound
      | SprintCompletedImmutable
      | SprintInvalid
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    remove: (
      id: string
    ) => Effect.Effect<
      void,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    ensureSprintAssignable: (
      sprintIds: ReadonlyArray<GroupId>
    ) => Effect.Effect<
      void,
      Forbidden | NotFound | SprintCompletedImmutable | Markdown.MarkdownError,
      ProjectScope
    >
    withSprints: <A, E, R>(
      use: (sprints: SprintFiles) => Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | Markdown.MarkdownError, R | ProjectScope>
    setSprintMembership: (
      ticketId: TicketId,
      sprintId: GroupId | null,
      options?: SprintMembershipOptions
    ) => Effect.Effect<
      void,
      | TicketChanged
      | Forbidden
      | NotFound
      | SprintCompletedImmutable
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    removeTicketFromAllGroups: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
  }>
>()("@pp/server-core/groups/Groups") {}

const MAX_CREATE_ATTEMPTS = 16
const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

type MovedTicket = Readonly<{ id: TicketId; previous: GroupId | undefined }>

type MoveOptions = Readonly<{ cause?: ActivityCause; from?: GroupId }>

function nextIdFrom(ids: ReadonlyArray<GroupId>) {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return makeGroupId(`G-${max + 1}`)
}

function pickColor(used: ReadonlyArray<string>) {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return makeGroupColor(c)
  return makeGroupColor(
    TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
  )
}

function documentToGroup(document: GroupDocs.GroupDocument) {
  const { body: _body, snapshot: _snapshot, ...group } = document
  return group
}

const sprintFilesOf = (documents: ReadonlyArray<GroupDocs.GroupDocument>) =>
  new Map(
    documents.flatMap((document) =>
      document.kind === "sprint" ? [[document.id, document] as const] : []
    )
  )

const requireGroupPolicy = (
  allowed: (scope: ProjectScope["Service"]) => boolean
) =>
  Effect.flatMap(ProjectScope, (scope) =>
    allowed(scope) ? Effect.void : Effect.fail(new Forbidden())
  )

const requireGroupAction = (kind: GroupKind, action: GroupPolicy.Action) =>
  requireGroupPolicy((scope) => GroupPolicy.can(scope, kind, action))

const make = Effect.gen(function* () {
  const groupDocs = yield* GroupDocs.GroupDocs
  const ticketDocs = yield* TicketDocs.TicketDocs
  const ticketIndex = yield* TicketIndex.TicketIndex
  const keyedLock = yield* KeyedLock.KeyedLock
  const finishedStatuses = yield* FinishedStatuses

  const withGroupFilesLock = <A, E, R>(
    orgSlug: string,
    slug: string,
    effect: Effect.Effect<A, E, R>
  ) => keyedLock.withLock(KeyedLock.LockKey.groupFiles(orgSlug, slug), effect)

  const lockedInScope = <A, E, R>(
    body: (scope: ProjectScope["Service"]) => Effect.Effect<A, E, R>
  ) =>
    Effect.flatMap(ProjectScope, (scope) =>
      withGroupFilesLock(scope.orgSlug, scope.slug, body(scope))
    )

  const readAll = (orgSlug: string, slug: string) =>
    groupDocs.listIds(orgSlug, slug).pipe(
      Effect.flatMap((ids) =>
        Effect.forEach(
          ids,
          (id) =>
            groupDocs.read(orgSlug, slug, id).pipe(
              Effect.map((document) => [document]),
              Effect.catchTag("NotFound", () => Effect.succeed([]))
            ),
          { concurrency: 8 }
        )
      ),
      Effect.map((documents) => documents.flat())
    )

  const withSprintTickets = (
    project: TicketProject,
    documents: ReadonlyArray<GroupDocs.GroupDocument>
  ) =>
    Effect.gen(function* () {
      const sprintIds = documents.flatMap((document) =>
        document.kind === "sprint" ? [document.id] : []
      )
      if (sprintIds.length === 0) return documents
      const rows = yield* ticketIndex.sprintTickets(project, sprintIds)
      const bySprint = new Map<string, Array<TicketId>>()
      for (const row of rows) {
        const tickets = bySprint.get(row.sprintId) ?? []
        tickets.push(row.id)
        bySprint.set(row.sprintId, tickets)
      }
      return documents.map((document) =>
        document.kind === "sprint"
          ? { ...document, tickets: bySprint.get(document.id) ?? [] }
          : document
      )
    })

  const sprintMembers = (project: TicketProject, sprintId: GroupId) =>
    ticketIndex.sprintTickets(project, [sprintId])

  const readTickets = (
    orgSlug: string,
    slug: string,
    ticketIds: ReadonlyArray<string>
  ) =>
    Effect.forEach(
      ticketIds,
      (id) =>
        ticketDocs
          .read(orgSlug, slug, id)
          .pipe(
            Effect.catchTag("MalformedTicketDocument", () =>
              Effect.fail(new NotFound())
            )
          ),
      { concurrency: 8 }
    )

  const moveTickets = (
    project: TicketProject,
    ticketIds: ReadonlyArray<TicketId>,
    sprint: GroupId | undefined,
    options: MoveOptions = {}
  ) => {
    const moved: Array<MovedTicket> = []
    const move = (
      id: TicketId,
      target: GroupId | undefined,
      from: GroupId | undefined,
      record: boolean
    ) =>
      ticketDocs
        .update(
          project.orgSlug,
          project.slug,
          id,
          (document) =>
            Effect.sync(() => {
              if (document.sprint === target) return document
              if (from !== undefined && document.sprint !== from) {
                return document
              }
              if (record) moved.push({ id, previous: document.sprint })
              return { ...document, sprint: target }
            }),
          (next) => ticketIndex.upsertTicket(project, next),
          options.cause === undefined ? {} : { cause: options.cause }
        )
        .pipe(
          Effect.asVoid,
          Effect.catchTag("NotFound", () => Effect.void),
          Effect.catchTag("MalformedTicketDocument", () =>
            Effect.fail(new NotFound())
          )
        )
    return Effect.forEach(
      ticketIds,
      (id) => move(id, sprint, options.from, true),
      { concurrency: 8, discard: true }
    ).pipe(
      Effect.as(moved),
      Effect.onError(() =>
        Effect.forEach(
          moved,
          ({ id, previous }) =>
            move(id, previous, sprint, false).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("sprint move: rollback failed", cause)
              )
            ),
          { concurrency: 8, discard: true }
        )
      )
    )
  }

  const validateTicketIds = (
    orgSlug: string,
    slug: string,
    ticketIds: ReadonlyArray<string>
  ) =>
    Effect.gen(function* () {
      if (ticketIds.length === 0) return
      const existing = yield* ticketDocs.listIds(orgSlug, slug)
      const set = new Set<string>(existing)
      for (const id of ticketIds) {
        if (!set.has(id)) {
          return yield* new NotFound()
        }
      }
    })

  const validateInterval = (startsAt: Date | null, endsAt: Date | null) =>
    startsAt !== null && endsAt !== null && endsAt < startsAt
      ? Effect.fail(new SprintInvalid({ kind: "invalid_interval" }))
      : Effect.void

  const validateCompletion = (
    completedAt: Date | null,
    startsAt: Date | null,
    now: Date
  ) => {
    if (completedAt === null) return Effect.void
    if (completedAt > now) {
      return Effect.fail(new SprintInvalid({ kind: "completed_in_future" }))
    }
    if (startsAt !== null && completedAt < startsAt) {
      return Effect.fail(new SprintInvalid({ kind: "completed_before_start" }))
    }
    return Effect.void
  }

  const documents = Effect.fn("Groups.documents")(function* () {
    const { orgSlug, slug } = yield* ProjectScope
    return yield* readAll(orgSlug, slug)
  })

  const list = Effect.fn("Groups.list")(function* () {
    const scope = yield* ProjectScope
    const all = yield* withSprintTickets(
      scope,
      yield* readAll(scope.orgSlug, scope.slug)
    )
    return all
      .map(documentToGroup)
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  })

  const matchesGroupFilter = (
    group: Group,
    filter: GroupFilter | undefined,
    now: Date
  ) => {
    if (!filter) return true
    if (filter.kind !== undefined) {
      if (filter.kind.length === 0) return false
      if (!filter.kind.includes(group.kind)) return false
    }
    if (filter.active !== undefined) {
      if (group.kind !== "sprint") return false
      const isActive = sprintState(group, now) === "active"
      if (filter.active !== isActive) return false
    }
    return true
  }

  const loadFilteredGroups = (
    predicate: (group: Group, now: Date) => boolean
  ) =>
    Effect.gen(function* () {
      const scope = yield* ProjectScope
      const docs = yield* readAll(scope.orgSlug, scope.slug)
      const now = yield* DateTime.nowAsDate
      const matching = yield* withSprintTickets(
        scope,
        docs.filter((document) => predicate(documentToGroup(document), now))
      )
      return matching.map(documentToGroup).toSorted((a, b) => {
        const ka = padNumericIdSort(a.id) ?? ""
        const kb = padNumericIdSort(b.id) ?? ""
        return ka < kb
          ? -1
          : ka > kb
            ? 1
            : a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
      })
    })

  const paginateGroups = (
    sorted: ReadonlyArray<Group>,
    cursor: CursorPayload | undefined,
    limit: number
  ) =>
    paginateSorted(sorted, {
      cursor,
      limit,
      sortKey: (g) => padNumericIdSort(g.id) ?? "",
      id: (g) => g.id
    })

  const listPaged = Effect.fn("Groups.listPaged")(function* (
    filter: GroupFilter | undefined,
    cursor: CursorPayload | undefined,
    limit: number
  ) {
    const sorted = yield* loadFilteredGroups((g, now) =>
      matchesGroupFilter(g, filter, now)
    )
    return paginateGroups(sorted, cursor, limit)
  })

  const listSprintsPaged = Effect.fn("Groups.listSprintsPaged")(function* (
    state: SprintState | undefined,
    cursor: CursorPayload | undefined,
    limit: number
  ) {
    const sorted = yield* loadFilteredGroups(
      (g, now) =>
        g.kind === "sprint" &&
        (state === undefined || sprintState(g, now) === state)
    )
    return paginateGroups(sorted, cursor, limit)
  })

  const detailOf = (
    project: TicketProject,
    document: GroupDocs.GroupDocument
  ) =>
    withSprintTickets(project, [document]).pipe(
      Effect.map(([filled]) => filled ?? document)
    )

  const get = Effect.fn("Groups.get")(function* (id: string) {
    const scope = yield* ProjectScope
    return yield* detailOf(
      scope,
      yield* groupDocs.read(scope.orgSlug, scope.slug, id)
    )
  })

  const rejectEpics = (tickets: ReadonlyArray<TicketDocs.TicketDocument>) =>
    tickets.some((ticket) => isEpic(ticket))
      ? Effect.fail(new HierarchyInvalid({ kind: "epic_in_sprint" }))
      : Effect.void

  const create = Effect.fn("Groups.create")(function* (
    input: CreateGroupInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = scope
        const kind: GroupKind = input.kind ?? "other"
        yield* requireGroupAction(kind, "manage")

        const requestedTickets = [...new Set(input.tickets ?? [])]
        yield* validateInterval(input.startsAt ?? null, input.endsAt ?? null)
        const [, sprintTickets, ids] = yield* Effect.all(
          [
            kind === "sprint"
              ? Effect.void
              : validateTicketIds(orgSlug, slug, requestedTickets),
            kind === "sprint"
              ? readTickets(orgSlug, slug, requestedTickets)
              : Effect.succeed([]),
            groupDocs.listIds(orgSlug, slug)
          ],
          { concurrency: "unbounded" }
        )
        yield* rejectEpics(sprintTickets)
        let candidate = nextIdFrom(ids)

        let color: GroupColor
        if (input.color !== undefined) {
          color = input.color
        } else if (kind === "sprint") {
          color = makeGroupColor("#777777")
        } else {
          const existingGroups = yield* readAll(orgSlug, slug)
          color = pickColor(
            existingGroups
              .filter((g) => g.kind !== "sprint")
              .map((g) => g.color)
          )
        }

        const now = yield* DateTime.nowAsDate
        const document: GroupDocs.GroupDocument = {
          id: candidate,
          name: input.name,
          kind,
          tickets: kind === "sprint" ? [] : requestedTickets,
          color,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
          body: input.body ?? `# ${input.name}\n`
        }

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const next: GroupDocs.GroupDocument = { ...document, id: candidate }
          const result = yield* groupDocs.create(orgSlug, slug, next).pipe(
            Effect.map(() => "ok" as const),
            Effect.catchTag("GroupIdTaken", () =>
              Effect.succeed("retry" as const)
            )
          )
          if (result === "ok") {
            if (kind === "sprint") {
              yield* moveTickets(scope, requestedTickets, next.id).pipe(
                Effect.onError(() =>
                  groupDocs
                    .remove(orgSlug, slug, next.id)
                    .pipe(
                      Effect.catchCause((cause) =>
                        Effect.logError("group create: rollback failed", cause)
                      )
                    )
                )
              )
            }
            return documentToGroup({ ...next, tickets: requestedTickets })
          }
          const freshIds = yield* groupDocs.listIds(orgSlug, slug)
          candidate = nextIdFrom(freshIds)
        }
        return yield* Effect.die(
          new Error(`could not allocate group id for "${slug}"`)
        )
      })
    )
  })

  const snapshotOf = (
    members: ReadonlyArray<TicketIndex.TicketIndexSprintTicket>
  ) =>
    members.map(
      ({ id, status, estimate }) =>
        ({ id, status, estimate }) satisfies SprintSnapshotTicket
    )

  const update = Effect.fn("Groups.update")(function* (
    id: string,
    input: UpdateGroupInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = scope
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(existing.kind, "manage")

        const now = yield* DateTime.nowAsDate
        const next: GroupDocs.GroupDocument = {
          ...existing,
          name: input.name ?? existing.name,
          color: input.color ?? existing.color,
          startsAt:
            input.startsAt !== undefined ? input.startsAt : existing.startsAt,
          endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt,
          completedAt:
            input.completedAt !== undefined
              ? input.completedAt
              : existing.completedAt,
          updatedAt: now
        }
        yield* validateInterval(next.startsAt, next.endsAt)
        yield* validateCompletion(next.completedAt, next.startsAt, now)
        const { snapshot: _snapshot, ...unsnapshotted } = next
        const snapshot =
          existing.kind !== "sprint" || next.completedAt === null
            ? undefined
            : existing.completedAt === null
              ? snapshotOf(yield* sprintMembers(scope, existing.id))
              : existing.snapshot
        const nextDocument: GroupDocs.GroupDocument = {
          ...unsnapshotted,
          ...(snapshot === undefined ? {} : { snapshot }),
          body: input.body ?? existing.body
        }

        yield* groupDocs.write(orgSlug, slug, id, nextDocument)
        return yield* detailOf(scope, nextDocument)
      })
    )
  })

  const changeSprintTickets = (
    scope: ProjectScope["Service"],
    sprint: GroupDocs.GroupDocument,
    requested: (current: ReadonlyArray<TicketId>) => ReadonlyArray<TicketId>
  ) =>
    Effect.gen(function* () {
      const { orgSlug, slug } = scope
      const current = (yield* sprintMembers(scope, sprint.id)).map(
        (member) => member.id
      )
      const nextTickets = [...new Set(requested(current))]
      if (GroupPolicy.ticketActions(current, nextTickets).length === 0) {
        return {
          target: { ...sprint, tickets: current },
          evicted: []
        } satisfies UpdateGroupTicketsOutput
      }
      const kept = new Set<string>(current)
      const wanted = new Set<string>(nextTickets)
      const additions = nextTickets.filter((id) => !kept.has(id))
      const removals = current.filter((id) => !wanted.has(id))
      const joining = yield* readTickets(orgSlug, slug, additions)
      yield* rejectEpics(joining)
      yield* requireGroupPolicy((actor) =>
        GroupPolicy.canChangeTickets(actor, "sprint", {
          current,
          next: nextTickets,
          evicts: joining.some((ticket) => ticket.sprint !== undefined)
        })
      )
      const joined = yield* moveTickets(scope, additions, sprint.id)
      yield* moveTickets(scope, removals, undefined, { from: sprint.id }).pipe(
        Effect.onError(() =>
          Effect.forEach(
            joined,
            ({ id, previous }) =>
              moveTickets(scope, [id], previous, { from: sprint.id }).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("sprint move: rollback failed", cause)
                )
              ),
            { discard: true }
          )
        )
      )
      const evicted = new Map<GroupId, Array<TicketId>>()
      for (const { id, previous } of joined) {
        if (previous === undefined) continue
        evicted.set(previous, [...(evicted.get(previous) ?? []), id])
      }
      return {
        target: { ...sprint, tickets: nextTickets },
        evicted: [...evicted].map(([groupId, ticketIds]) => ({
          groupId,
          ticketIds
        }))
      } satisfies UpdateGroupTicketsOutput
    })

  const changeListedTickets = (
    orgSlug: string,
    slug: string,
    current: GroupDocs.GroupDocument,
    nextTickets: ReadonlyArray<TicketId>
  ) =>
    Effect.gen(function* () {
      if (
        GroupPolicy.ticketActions(current.tickets, nextTickets).length === 0
      ) {
        return {
          target: current,
          evicted: []
        } satisfies UpdateGroupTicketsOutput
      }
      yield* requireGroupPolicy((scope) =>
        GroupPolicy.canChangeTickets(scope, current.kind, {
          current: current.tickets,
          next: nextTickets,
          evicts: false
        })
      )
      const target: GroupDocs.GroupDocument = {
        ...current,
        tickets: nextTickets,
        updatedAt: yield* DateTime.nowAsDate
      }
      yield* groupDocs.write(orgSlug, slug, current.id, target)
      return { target, evicted: [] } satisfies UpdateGroupTicketsOutput
    })

  const changeTickets = (
    scope: ProjectScope["Service"],
    group: GroupDocs.GroupDocument,
    requested: (current: ReadonlyArray<TicketId>) => ReadonlyArray<TicketId>
  ) =>
    group.kind === "sprint"
      ? changeSprintTickets(scope, group, requested)
      : Effect.gen(function* () {
          const nextTickets = requested(group.tickets)
          yield* validateTicketIds(
            scope.orgSlug,
            scope.slug,
            nextTickets.filter((id) => !group.tickets.includes(id))
          )
          return yield* changeListedTickets(
            scope.orgSlug,
            scope.slug,
            group,
            nextTickets
          )
        })

  const updateTickets = Effect.fn("Groups.updateTickets")(function* (
    id: string,
    input: UpdateGroupTicketsInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const existing = yield* groupDocs.read(scope.orgSlug, scope.slug, id)
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        return yield* changeTickets(scope, existing, () => input.tickets)
      })
    )
  })

  const addTickets = Effect.fn("Groups.addTickets")(function* (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const existing = yield* groupDocs.read(scope.orgSlug, scope.slug, id)
        yield* requireGroupAction(existing.kind, "add_ticket")
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        return yield* changeTickets(scope, existing, (current) => [
          ...current,
          ...ticketIds
        ])
      })
    )
  })

  const removeTickets = Effect.fn("Groups.removeTickets")(function* (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const existing = yield* groupDocs.read(scope.orgSlug, scope.slug, id)
        yield* requireGroupAction(existing.kind, "remove_ticket")
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        const drop = new Set<string>(ticketIds)
        if (existing.kind !== "sprint") {
          return yield* changeListedTickets(
            scope.orgSlug,
            scope.slug,
            existing,
            existing.tickets.filter((tid) => !drop.has(tid))
          )
        }
        const current = (yield* sprintMembers(scope, existing.id)).map(
          (member) => member.id
        )
        const leaving = current.filter((tid) => drop.has(tid))
        yield* moveTickets(scope, leaving, undefined, { from: existing.id })
        return {
          target: {
            ...existing,
            tickets: current.filter((tid) => !drop.has(tid))
          },
          evicted: []
        } satisfies UpdateGroupTicketsOutput
      })
    )
  })

  const complete = Effect.fn("Groups.complete")(function* (
    id: string,
    input: CompleteSprintInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = scope
        const source = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(source.kind, "manage")

        if (source.kind !== "sprint") {
          return yield* new SprintInvalid({ kind: "not_a_sprint" })
        }
        if (source.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }

        let destination: GroupId | undefined = undefined
        if (input.destination.kind === "sprint") {
          if (input.destination.groupId === source.id) {
            return yield* new SprintInvalid({ kind: "destination_is_source" })
          }
          const dest = yield* groupDocs.read(
            orgSlug,
            slug,
            input.destination.groupId
          )
          if (dest.kind !== "sprint") {
            return yield* new SprintInvalid({ kind: "destination_not_sprint" })
          }
          if (dest.completedAt !== null) {
            return yield* new SprintCompletedImmutable()
          }
          destination = dest.id
        }

        const now = yield* DateTime.nowAsDate
        yield* validateCompletion(now, source.startsAt, now)

        const [members, finished] = yield* Effect.all(
          [
            sprintMembers(scope, source.id),
            finishedStatuses.forProject(orgSlug, slug)
          ],
          { concurrency: 2 }
        )
        const carried = members
          .filter((member) => isCarryover(member.status, finished))
          .map((member) => member.id)
        const stay = members
          .filter((member) => !isCarryover(member.status, finished))
          .map((member) => member.id)

        const moved = yield* moveTickets(scope, carried, destination, {
          cause: "sprint_completed",
          from: source.id
        })
        const nextSource: GroupDocs.GroupDocument = {
          ...source,
          completedAt: now,
          updatedAt: now,
          snapshot: snapshotOf(members)
        }
        yield* groupDocs
          .write(orgSlug, slug, id, nextSource, { cause: "sprint_completed" })
          .pipe(
            Effect.onError(() =>
              moveTickets(
                scope,
                moved.map((ticket) => ticket.id),
                source.id,
                { cause: "sprint_completed" }
              ).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("sprint complete: rollback failed", cause)
                )
              )
            )
          )
        return {
          target: { ...nextSource, tickets: stay },
          carried
        }
      })
    )
  })

  const remove = Effect.fn("Groups.remove")(function* (id: string) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = scope
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(existing.kind, "manage")
        const moved =
          existing.kind === "sprint"
            ? yield* sprintMembers(scope, existing.id).pipe(
                Effect.flatMap((members) =>
                  moveTickets(
                    scope,
                    members.map((member) => member.id),
                    undefined,
                    { cause: "group_deleted", from: existing.id }
                  )
                )
              )
            : []
        yield* groupDocs.remove(orgSlug, slug, id).pipe(
          Effect.onError(() =>
            moveTickets(
              scope,
              moved.map((ticket) => ticket.id),
              existing.id,
              { cause: "group_deleted" }
            ).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("sprint delete: rollback failed", cause)
              )
            )
          )
        )
      })
    )
  })

  const assignable = (
    sprints: SprintFiles,
    sprintIds: ReadonlyArray<GroupId>
  ) =>
    Effect.gen(function* () {
      yield* requireGroupAction("sprint", "add_ticket")
      for (const sprintId of sprintIds) {
        const sprint = sprints.get(sprintId)
        if (sprint === undefined) return yield* new NotFound()
        if (sprint.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
      }
    })

  const ensureSprintAssignable = Effect.fn("Groups.ensureSprintAssignable")(
    function* (sprintIds: ReadonlyArray<GroupId>) {
      yield* requireGroupAction("sprint", "add_ticket")
      const { orgSlug, slug } = yield* ProjectScope
      const sprints = yield* Effect.forEach(
        [...new Set(sprintIds)],
        (sprintId) => groupDocs.read(orgSlug, slug, sprintId),
        { concurrency: 8 }
      )
      yield* assignable(sprintFilesOf(sprints), sprintIds)
    }
  )

  const withSprints = <A, E, R>(
    use: (sprints: SprintFiles) => Effect.Effect<A, E, R>
  ) =>
    lockedInScope(({ orgSlug, slug }) =>
      readAll(orgSlug, slug).pipe(
        Effect.flatMap((all) => use(sprintFilesOf(all)))
      )
    )

  const setSprintMembership = Effect.fn("Groups.setSprintMembership")(
    function* (
      ticketId: TicketId,
      sprintId: GroupId | null,
      options?: SprintMembershipOptions
    ) {
      const scope = yield* ProjectScope
      return yield* withSprints((sprints) =>
        Effect.gen(function* () {
          if (sprintId !== null) yield* assignable(sprints, [sprintId])
          return yield* ticketDocs
            .update(
              scope.orgSlug,
              scope.slug,
              ticketId,
              (document) =>
                Effect.gen(function* () {
                  if (
                    options?.from !== undefined &&
                    (document.sprint ?? null) !== options.from
                  ) {
                    return yield* new TicketChanged({
                      kind: "sprint_membership_changed"
                    })
                  }
                  const sprint = sprintId ?? undefined
                  return sprint === document.sprint
                    ? document
                    : { ...document, sprint }
                }),
              (next) => ticketIndex.upsertTicket(scope, next)
            )
            .pipe(
              Effect.asVoid,
              Effect.catchTag("MalformedTicketDocument", () =>
                Effect.fail(new NotFound())
              )
            )
        })
      )
    }
  )

  const removeTicketFromAllGroups = Effect.fn(
    "Groups.removeTicketFromAllGroups"
  )(function* (project: TicketProject, ticketId: string) {
    const { orgSlug, slug } = project
    const ids = yield* groupDocs.listIds(orgSlug, slug)
    yield* Effect.forEach(
      ids,
      (id) =>
        Effect.gen(function* () {
          const group = yield* groupDocs
            .read(orgSlug, slug, id)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))
          if (group === null || group.kind === "sprint") return
          if (
            !group.tickets.some((groupTicketId) => groupTicketId === ticketId)
          ) {
            return
          }
          const next: GroupDocs.GroupDocument = {
            ...group,
            tickets: group.tickets.filter((t) => t !== ticketId),
            updatedAt: yield* DateTime.nowAsDate
          }
          yield* groupDocs
            .writeIfExists(orgSlug, slug, id, next)
            .pipe(Effect.catchTag("NotFound", () => Effect.void))
        }),
      { concurrency: 8 }
    )
  })

  return Groups.of({
    list,
    listPaged,
    listSprintsPaged,
    documents,
    get,
    create,
    update,
    updateTickets,
    addTickets,
    removeTickets,
    complete,
    remove,
    ensureSprintAssignable,
    withSprints,
    setSprintMembership,
    removeTicketFromAllGroups
  })
})

export const layer = Layer.effect(Groups, make)
