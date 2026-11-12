import { GroupPolicy } from "@pp/access/policies"
import {
  type ActivityActor,
  type CompleteSprintInput,
  Conflict,
  type CompleteSprintOutput,
  GroupId,
  type CreateGroupInput,
  type CursorPayload,
  Group,
  type GroupDetail,
  type GroupFilter,
  NotFound,
  SprintCompletedImmutable,
  type SprintState,
  TicketId,
  type UpdateGroupInput,
  type UpdateGroupTicketsInput,
  UpdateGroupTicketsOutput,
  Validation,
  ProjectScope,
  Forbidden,
  GroupColor,
  GroupKind,
  isCarryover,
  paginateSorted,
  padNumericIdSort,
  sprintState,
  TAG_DEFAULT_PALETTE
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
import * as GroupDocs from "./GroupDocs"

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
      Forbidden | NotFound | Validation | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    update: (
      id: string,
      input: UpdateGroupInput
    ) => Effect.Effect<
      GroupDetail,
      Forbidden | NotFound | Validation | Markdown.MarkdownError,
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
      | Validation
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
      | Validation
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
      | Validation
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
    setSprintMembership: (
      orgSlug: string,
      slug: string,
      ticketId: TicketId,
      sprintId: GroupId | null,
      options?: SprintMembershipOptions
    ) => Effect.Effect<void, Conflict | Markdown.MarkdownError, ActivityActor>
    removeTicketFromAllGroups: (
      orgSlug: string,
      slug: string,
      ticketId: string
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
  }>
>()("@pp/server-core/groups/Groups") {}

const MAX_CREATE_ATTEMPTS = 16
const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

function nextIdFrom(ids: ReadonlyArray<GroupId>): GroupId {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return makeGroupId(`G-${max + 1}`)
}

function pickColor(used: ReadonlyArray<string>): GroupColor {
  for (const c of TAG_DEFAULT_PALETTE)
    if (!used.includes(c)) return makeGroupColor(c)
  return makeGroupColor(
    TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
  )
}

function documentToGroup(document: GroupDocs.GroupDocument): Group {
  const { body: _body, ...group } = document
  return group
}

const requireGroupPolicy = (
  allowed: (scope: ProjectScope["Service"]) => boolean
): Effect.Effect<void, Forbidden, ProjectScope> =>
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
  ): Effect.Effect<A, E, R> =>
    keyedLock.withLock(KeyedLock.LockKey.groupFiles(orgSlug, slug), effect)

  const lockedInScope = <A, E, R>(
    body: (scope: ProjectScope["Service"]) => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R | ProjectScope> =>
    Effect.flatMap(ProjectScope, (scope) =>
      withGroupFilesLock(scope.orgSlug, scope.slug, body(scope))
    )

  const validateTicketIds = (
    orgSlug: string,
    slug: string,
    ticketIds: ReadonlyArray<string>
  ): Effect.Effect<void, NotFound | Markdown.MarkdownError> =>
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

  const rejectEpicsInSprint = (
    scope: ProjectScope["Service"],
    kind: GroupKind,
    ticketIds: ReadonlyArray<string>
  ): Effect.Effect<void, Validation> =>
    Effect.gen(function* () {
      if (kind !== "sprint" || ticketIds.length === 0) return
      const entries = yield* ticketIndex.list(scope, ticketIds)
      if (entries.some((entry) => entry.type === "epic")) {
        return yield* new Validation({ reason: "epic_in_sprint" })
      }
    })

  const validateInterval = (
    startsAt: Date | null,
    endsAt: Date | null
  ): Effect.Effect<void, Validation> =>
    startsAt !== null && endsAt !== null && endsAt < startsAt
      ? Effect.fail(new Validation({ reason: "invalid_interval" }))
      : Effect.void

  const validateCompletion = (
    completedAt: Date | null,
    startsAt: Date | null,
    now: Date
  ): Effect.Effect<void, Validation> => {
    if (completedAt === null) return Effect.void
    if (completedAt > now) {
      return Effect.fail(new Validation({ reason: "completed_in_future" }))
    }
    if (startsAt !== null && completedAt < startsAt) {
      return Effect.fail(new Validation({ reason: "completed_before_start" }))
    }
    return Effect.void
  }

  const list = Effect.fn("Groups.list")(function* () {
    const { orgSlug, slug } = yield* ProjectScope
    const ids = yield* groupDocs.listIds(orgSlug, slug)
    const results = yield* Effect.forEach(
      ids,
      (id) => groupDocs.read(orgSlug, slug, id),
      { concurrency: 8 }
    )
    return results
      .map(documentToGroup)
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  })

  const matchesGroupFilter = (
    group: Group,
    filter: GroupFilter | undefined,
    now: Date
  ): boolean => {
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
  ): Effect.Effect<
    ReadonlyArray<Group>,
    NotFound | Markdown.MarkdownError,
    ProjectScope
  > =>
    Effect.gen(function* () {
      const { orgSlug, slug } = yield* ProjectScope
      const ids = yield* groupDocs.listIds(orgSlug, slug)
      const docs = yield* Effect.forEach(
        ids,
        (id) => groupDocs.read(orgSlug, slug, id),
        { concurrency: 8 }
      )
      const now = yield* DateTime.nowAsDate
      return docs
        .map(documentToGroup)
        .filter((g) => predicate(g, now))
        .toSorted((a, b) => {
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

  const get = Effect.fn("Groups.get")(function* (id: string) {
    const { orgSlug, slug } = yield* ProjectScope
    return yield* groupDocs.read(orgSlug, slug, id)
  })

  const create = Effect.fn("Groups.create")(function* (
    input: CreateGroupInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = scope
        const kind: GroupKind = input.kind ?? "other"
        yield* requireGroupAction(kind, "manage")

        const requestedTickets = input.tickets ?? []
        yield* validateInterval(input.startsAt ?? null, input.endsAt ?? null)
        const [, , ids] = yield* Effect.all(
          [
            validateTicketIds(orgSlug, slug, requestedTickets),
            rejectEpicsInSprint(scope, kind, requestedTickets),
            groupDocs.listIds(orgSlug, slug)
          ],
          { concurrency: "unbounded" }
        )
        let candidate = nextIdFrom(ids)

        let color: GroupColor
        if (input.color !== undefined) {
          color = input.color
        } else if (kind === "sprint") {
          color = makeGroupColor("#777777")
        } else {
          const existingGroups = yield* Effect.forEach(
            ids,
            (id) => groupDocs.read(orgSlug, slug, id),
            { concurrency: 8 }
          )
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
          tickets: requestedTickets,
          color,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
          body: input.body ?? `# ${input.name}\n`
        }

        const evictions =
          kind === "sprint"
            ? yield* planEvictions(orgSlug, slug, null, requestedTickets)
            : []

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const next: GroupDocs.GroupDocument = { ...document, id: candidate }
          const result = yield* groupDocs.create(orgSlug, slug, next).pipe(
            Effect.map(() => "ok" as const),
            Effect.catchTag("GroupIdTaken", () =>
              Effect.succeed("retry" as const)
            )
          )
          if (result === "ok") {
            yield* writeEvictions(orgSlug, slug, evictions, now).pipe(
              Effect.onError(() =>
                Effect.forEach(
                  [
                    groupDocs.remove(orgSlug, slug, next.id),
                    ...evictions.map(({ group }) =>
                      groupDocs.write(orgSlug, slug, group.id, group)
                    )
                  ],
                  (undo) =>
                    undo.pipe(
                      Effect.catchCause((cause) =>
                        Effect.logError("group create: rollback failed", cause)
                      )
                    ),
                  { discard: true }
                )
              )
            )
            return documentToGroup(next)
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

  const update = Effect.fn("Groups.update")(function* (
    id: string,
    input: UpdateGroupInput
  ) {
    return yield* lockedInScope(({ orgSlug, slug }) =>
      Effect.gen(function* () {
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
        const nextDocument: GroupDocs.GroupDocument = {
          ...next,
          body: input.body ?? existing.body
        }

        yield* groupDocs.write(orgSlug, slug, id, nextDocument)
        return nextDocument
      })
    )
  })

  const planEvictions = (
    orgSlug: string,
    slug: string,
    groupId: GroupId | null,
    incoming: ReadonlyArray<TicketId>
  ): Effect.Effect<
    ReadonlyArray<
      Readonly<{
        group: GroupDocs.GroupDocument
        overlap: ReadonlyArray<TicketId>
      }>
    >,
    Markdown.MarkdownError
  > =>
    Effect.gen(function* () {
      if (incoming.length === 0) return []
      const incomingSet = new Set<string>(incoming)
      const allIds = yield* groupDocs.listIds(orgSlug, slug)
      const others = yield* Effect.forEach(
        allIds.filter((otherId) => otherId !== groupId),
        (otherId) =>
          groupDocs
            .read(orgSlug, slug, otherId)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
        { concurrency: 8 }
      )
      return others.flatMap((group) => {
        if (group === null) return []
        if (group.kind !== "sprint" || group.completedAt !== null) return []
        const overlap = group.tickets.filter((tid) => incomingSet.has(tid))
        return overlap.length === 0 ? [] : [{ group, overlap }]
      })
    })

  const writeEvictions = (
    orgSlug: string,
    slug: string,
    evictions: ReadonlyArray<
      Readonly<{
        group: GroupDocs.GroupDocument
        overlap: ReadonlyArray<TicketId>
      }>
    >,
    now: Date
  ) =>
    Effect.forEach(
      evictions,
      ({ group, overlap }) => {
        const dropped = new Set<string>(overlap)
        return groupDocs
          .write(orgSlug, slug, group.id, {
            ...group,
            tickets: group.tickets.filter((tid) => !dropped.has(tid)),
            updatedAt: now
          })
          .pipe(Effect.as({ groupId: group.id, ticketIds: overlap }))
      },
      { concurrency: 1 }
    )

  const changeTickets = (
    orgSlug: string,
    slug: string,
    current: GroupDocs.GroupDocument,
    nextTickets: ReadonlyArray<TicketId>
  ): Effect.Effect<
    UpdateGroupTicketsOutput,
    Forbidden | Markdown.MarkdownError,
    ProjectScope | ActivityActor
  > =>
    Effect.gen(function* () {
      if (
        GroupPolicy.ticketActions(current.tickets, nextTickets).length === 0
      ) {
        return {
          target: current,
          evicted: []
        } satisfies UpdateGroupTicketsOutput
      }
      const evictions =
        current.kind === "sprint"
          ? yield* planEvictions(orgSlug, slug, current.id, nextTickets)
          : []
      yield* requireGroupPolicy((scope) =>
        GroupPolicy.canChangeTickets(scope, current.kind, {
          current: current.tickets,
          next: nextTickets,
          evicts: evictions.length > 0
        })
      )
      const now = yield* DateTime.nowAsDate
      const evicted = yield* writeEvictions(orgSlug, slug, evictions, now)
      const target: GroupDocs.GroupDocument = {
        ...current,
        tickets: nextTickets,
        updatedAt: now
      }
      yield* groupDocs.write(orgSlug, slug, current.id, target)
      return { target, evicted } satisfies UpdateGroupTicketsOutput
    })

  const updateTickets = Effect.fn("Groups.updateTickets")(function* (
    id: string,
    input: UpdateGroupTicketsInput
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = scope
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        yield* Effect.all(
          [
            validateTicketIds(orgSlug, slug, input.tickets),
            rejectEpicsInSprint(scope, existing.kind, input.tickets)
          ],
          { concurrency: 2, discard: true }
        )
        return yield* changeTickets(orgSlug, slug, existing, input.tickets)
      })
    )
  })

  const addTickets = Effect.fn("Groups.addTickets")(function* (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) {
    return yield* lockedInScope((scope) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = scope
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(existing.kind, "add_ticket")
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }

        const seen = new Set<string>(existing.tickets)
        const additions: TicketId[] = []
        for (const tid of ticketIds) {
          if (seen.has(tid)) continue
          seen.add(tid)
          additions.push(tid)
        }
        if (additions.length === 0) {
          return {
            target: existing,
            evicted: []
          } satisfies UpdateGroupTicketsOutput
        }

        yield* Effect.all(
          [
            validateTicketIds(orgSlug, slug, additions),
            rejectEpicsInSprint(scope, existing.kind, additions)
          ],
          { concurrency: 2, discard: true }
        )
        const merged = [...existing.tickets, ...additions]
        return yield* changeTickets(orgSlug, slug, existing, merged)
      })
    )
  })

  const removeTickets = Effect.fn("Groups.removeTickets")(function* (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) {
    return yield* lockedInScope(({ orgSlug, slug }) =>
      Effect.gen(function* () {
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(existing.kind, "remove_ticket")
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        const drop = new Set<string>(ticketIds)
        const remaining = existing.tickets.filter((tid) => !drop.has(tid))
        if (remaining.length === existing.tickets.length) {
          return {
            target: existing,
            evicted: []
          } satisfies UpdateGroupTicketsOutput
        }
        return yield* changeTickets(orgSlug, slug, existing, remaining)
      })
    )
  })

  const complete = Effect.fn("Groups.complete")(function* (
    id: string,
    input: CompleteSprintInput
  ) {
    return yield* lockedInScope(({ orgSlug, slug }) =>
      Effect.gen(function* () {
        const source = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(source.kind, "manage")

        if (source.kind !== "sprint") {
          return yield* new Validation({ reason: "not_a_sprint" })
        }
        if (source.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }

        let dest: GroupDocs.GroupDocument | null = null
        if (input.destination.kind === "sprint") {
          if (input.destination.groupId === source.id) {
            return yield* new Validation({ reason: "destination_is_source" })
          }
          dest = yield* groupDocs.read(orgSlug, slug, input.destination.groupId)
          if (dest.kind !== "sprint") {
            return yield* new Validation({ reason: "destination_not_sprint" })
          }
          if (dest.completedAt !== null) {
            return yield* new SprintCompletedImmutable()
          }
        }

        const now = yield* DateTime.nowAsDate
        yield* validateCompletion(now, source.startsAt, now)

        const [tickets, finished] = yield* Effect.all(
          [
            Effect.forEach(
              source.tickets,
              (tid) =>
                ticketDocs
                  .read(orgSlug, slug, tid)
                  .pipe(
                    Effect.catchTag("MalformedTicketDocument", () =>
                      Effect.fail(new NotFound())
                    )
                  ),
              { concurrency: 8 }
            ),
            finishedStatuses.forProject(orgSlug, slug)
          ],
          { concurrency: 2 }
        )
        const stay: Array<TicketId> = []
        const carry: Array<TicketId> = []
        for (const ticket of tickets) {
          if (isCarryover(ticket.status, finished)) carry.push(ticket.id)
          else stay.push(ticket.id)
        }

        if (dest !== null && carry.length > 0) {
          const merged = [...dest.tickets]
          for (const tid of carry) {
            if (!merged.includes(tid)) merged.push(tid)
          }
          const nextDest: GroupDocs.GroupDocument = {
            ...dest,
            tickets: merged,
            updatedAt: now
          }
          yield* groupDocs.write(orgSlug, slug, dest.id, nextDest, {
            cause: "sprint_completed"
          })
        }

        const nextSource: GroupDocs.GroupDocument = {
          ...source,
          tickets: stay,
          completedAt: now,
          updatedAt: now
        }
        yield* groupDocs.write(orgSlug, slug, id, nextSource, {
          cause: "sprint_completed"
        })
        return { target: nextSource, carried: carry }
      })
    )
  })

  const remove = Effect.fn("Groups.remove")(function* (id: string) {
    return yield* lockedInScope(({ orgSlug, slug }) =>
      Effect.gen(function* () {
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireGroupAction(existing.kind, "manage")
        yield* groupDocs.remove(orgSlug, slug, id)
      })
    )
  })

  const ensureSprintAssignable = Effect.fn("Groups.ensureSprintAssignable")(
    function* (sprintIds: ReadonlyArray<GroupId>) {
      yield* requireGroupAction("sprint", "add_ticket")
      const { orgSlug, slug } = yield* ProjectScope
      yield* Effect.forEach(
        [...new Set(sprintIds)],
        (sprintId) =>
          Effect.gen(function* () {
            const group = yield* groupDocs.read(orgSlug, slug, sprintId)
            if (group.kind !== "sprint") return yield* new NotFound()
            if (group.completedAt !== null) {
              return yield* new SprintCompletedImmutable()
            }
          }),
        { discard: true }
      )
    }
  )

  const setSprintMembership = Effect.fn("Groups.setSprintMembership")(
    function* (
      orgSlug: string,
      slug: string,
      ticketId: TicketId,
      sprintId: GroupId | null,
      options?: SprintMembershipOptions
    ) {
      return yield* withGroupFilesLock(
        orgSlug,
        slug,
        Effect.gen(function* () {
          const ids = yield* groupDocs.listIds(orgSlug, slug)
          const groups = yield* Effect.forEach(
            ids,
            (id) =>
              groupDocs
                .read(orgSlug, slug, id)
                .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
            { concurrency: 8 }
          )
          const activeSprints = groups.filter(
            (group): group is GroupDocs.GroupDocument =>
              group !== null &&
              group.kind === "sprint" &&
              group.completedAt === null
          )
          if (options?.from !== undefined) {
            const current =
              activeSprints.find((group) => group.tickets.includes(ticketId))
                ?.id ?? null
            if (current !== options.from) {
              return yield* new Conflict({
                reason: "sprint_membership_changed"
              })
            }
          }
          yield* Effect.forEach(
            activeSprints,
            (group) =>
              Effect.gen(function* () {
                const present = group.tickets.includes(ticketId)
                const wanted = group.id === sprintId
                if (present === wanted) return

                const remaining = group.tickets.filter((t) => t !== ticketId)
                const next: GroupDocs.GroupDocument = {
                  ...group,
                  tickets: wanted ? [...remaining, ticketId] : remaining,
                  updatedAt: yield* DateTime.nowAsDate
                }
                yield* groupDocs
                  .writeIfExists(orgSlug, slug, group.id, next)
                  .pipe(Effect.catchTag("NotFound", () => Effect.void))
              }),
            { concurrency: 1 }
          )
        })
      )
    }
  )

  const removeTicketFromAllGroups = Effect.fn(
    "Groups.removeTicketFromAllGroups"
  )(function* (orgSlug: string, slug: string, ticketId: string) {
    return yield* withGroupFilesLock(
      orgSlug,
      slug,
      Effect.gen(function* () {
        const ids = yield* groupDocs.listIds(orgSlug, slug)
        yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const group = yield* groupDocs
                .read(orgSlug, slug, id)
                .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))
              if (group === null) return
              if (
                !group.tickets.some(
                  (groupTicketId) => groupTicketId === ticketId
                )
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
    )
  })

  return Groups.of({
    list,
    listPaged,
    listSprintsPaged,
    get,
    create,
    update,
    updateTickets,
    addTickets,
    removeTickets,
    complete,
    remove,
    ensureSprintAssignable,
    setSprintMembership,
    removeTicketFromAllGroups
  })
})

export const layer = Layer.effect(Groups, make)
