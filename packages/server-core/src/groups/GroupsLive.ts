import { GroupPolicy } from "@pp/access/policies"
import {
  Forbidden,
  Group,
  GroupColor,
  GroupId,
  GroupKind,
  isCarryover,
  NotFound,
  paginateSorted,
  padNumericIdSort,
  SprintCompletedImmutable,
  sprintState,
  TAG_DEFAULT_PALETTE,
  TicketId,
  type CursorPayload,
  type GroupFilter,
  UpdateGroupTicketsOutput,
  Validation,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { KeyedLock, LockKey } from "../locks/KeyedLock"
import type { MarkdownError } from "../markdown/Markdown"
import { TicketDocs } from "../tickets/TicketDocs"
import { GroupDocs, type GroupDocument } from "./GroupDocs"
import { Groups, type GroupsShape } from "./Groups"

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

function documentToGroup(document: GroupDocument): Group {
  const { body: _body, ...group } = document
  return group
}

const requireGroupPolicy = (
  allowed: (scope: ProjectScopeShape) => boolean
): Effect.Effect<void, Forbidden, ProjectScope> =>
  Effect.flatMap(ProjectScope, (scope) =>
    allowed(scope) ? Effect.void : Effect.fail(new Forbidden())
  )

const requireGroupAction = (kind: GroupKind, action: GroupPolicy.Action) =>
  requireGroupPolicy((scope) => GroupPolicy.can(scope, kind, action))

export const GroupsLive = Layer.effect(
  Groups,
  Effect.gen(function* () {
    const groupDocs = yield* GroupDocs
    const ticketDocs = yield* TicketDocs
    const keyedLock = yield* KeyedLock

    const withGroupFilesLock = <A, E, R>(
      orgSlug: string,
      slug: string,
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E, R> =>
      keyedLock.withLock(LockKey.groupFiles(orgSlug, slug), effect)

    const lockedInScope = <A, E, R>(
      body: (scope: ProjectScopeShape) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E, R | ProjectScope> =>
      Effect.flatMap(ProjectScope, (scope) =>
        withGroupFilesLock(scope.orgSlug, scope.slug, body(scope))
      )

    const validateTicketIds = (
      orgSlug: string,
      slug: string,
      ticketIds: ReadonlyArray<string>
    ): Effect.Effect<void, NotFound | MarkdownError> =>
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

    const list: GroupsShape["list"] = () =>
      Effect.gen(function* () {
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
      NotFound | MarkdownError,
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

    const listPaged: GroupsShape["listPaged"] = (filter, cursor, limit) =>
      Effect.gen(function* () {
        const sorted = yield* loadFilteredGroups((g, now) =>
          matchesGroupFilter(g, filter, now)
        )
        return paginateGroups(sorted, cursor, limit)
      })

    const listSprintsPaged: GroupsShape["listSprintsPaged"] = (
      state,
      cursor,
      limit
    ) =>
      Effect.gen(function* () {
        const sorted = yield* loadFilteredGroups(
          (g, now) =>
            g.kind === "sprint" &&
            (state === undefined || sprintState(g, now) === state)
        )
        return paginateGroups(sorted, cursor, limit)
      })

    const get: GroupsShape["get"] = (id) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = yield* ProjectScope
        return yield* groupDocs.read(orgSlug, slug, id)
      })

    const create: GroupsShape["create"] = (input) =>
      lockedInScope(({ orgSlug, slug, userId }) =>
        Effect.gen(function* () {
          const kind: GroupKind = input.kind ?? "other"
          yield* requireGroupAction(kind, "manage")

          const requestedTickets = input.tickets ?? []
          yield* validateTicketIds(orgSlug, slug, requestedTickets)
          yield* validateInterval(input.startsAt ?? null, input.endsAt ?? null)

          const ids = yield* groupDocs.listIds(orgSlug, slug)
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
          const document: GroupDocument = {
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
            body: `# ${input.name}\n`
          }

          const evictions =
            kind === "sprint"
              ? yield* planEvictions(orgSlug, slug, null, requestedTickets)
              : []

          for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
            const next: GroupDocument = { ...document, id: candidate }
            const result = yield* groupDocs.create(orgSlug, slug, next).pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("GroupIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
            if (result === "ok") {
              yield* writeEvictions(orgSlug, slug, evictions, now)
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

    const update: GroupsShape["update"] = (id, input) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
          const existing = yield* groupDocs.read(orgSlug, slug, id)
          yield* requireGroupAction(existing.kind, "manage")

          const now = yield* DateTime.nowAsDate
          const next: GroupDocument = {
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
          const nextDocument: GroupDocument = {
            ...next,
            body: input.body ?? existing.body
          }

          yield* groupDocs.write(orgSlug, slug, id, nextDocument)
          return nextDocument
        })
      )

    const planEvictions = (
      orgSlug: string,
      slug: string,
      groupId: GroupId | null,
      incoming: ReadonlyArray<TicketId>
    ): Effect.Effect<
      ReadonlyArray<
        Readonly<{ group: GroupDocument; overlap: ReadonlyArray<TicketId> }>
      >,
      MarkdownError
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
        Readonly<{ group: GroupDocument; overlap: ReadonlyArray<TicketId> }>
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
      current: GroupDocument,
      nextTickets: ReadonlyArray<TicketId>
    ): Effect.Effect<
      UpdateGroupTicketsOutput,
      Forbidden | MarkdownError,
      ProjectScope
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
        const target: GroupDocument = {
          ...current,
          tickets: nextTickets,
          updatedAt: now
        }
        yield* groupDocs.write(orgSlug, slug, current.id, target)
        return { target, evicted } satisfies UpdateGroupTicketsOutput
      })

    const updateTickets: GroupsShape["updateTickets"] = (id, input) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
          const existing = yield* groupDocs.read(orgSlug, slug, id)
          if (existing.completedAt !== null) {
            return yield* new SprintCompletedImmutable()
          }
          yield* validateTicketIds(orgSlug, slug, input.tickets)
          return yield* changeTickets(orgSlug, slug, existing, input.tickets)
        })
      )

    const addTickets: GroupsShape["addTickets"] = (id, ticketIds) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
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

          yield* validateTicketIds(orgSlug, slug, additions)
          const merged = [...existing.tickets, ...additions]
          return yield* changeTickets(orgSlug, slug, existing, merged)
        })
      )

    const removeTickets: GroupsShape["removeTickets"] = (id, ticketIds) =>
      lockedInScope(({ orgSlug, slug }) =>
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

    const updateTicketOrder: GroupsShape["updateTicketOrder"] = (id, input) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
          const existing = yield* groupDocs.read(orgSlug, slug, id)
          yield* requireGroupAction(existing.kind, "reorder")
          if (existing.completedAt !== null) {
            return yield* new SprintCompletedImmutable()
          }
          if (input.after !== null && input.after === input.ticketId) {
            return yield* new Validation({ reason: "after_is_self" })
          }
          if (!existing.tickets.includes(input.ticketId)) {
            return yield* new NotFound()
          }
          if (input.after !== null && !existing.tickets.includes(input.after)) {
            return yield* new NotFound()
          }

          const filtered = existing.tickets.filter(
            (tid) => tid !== input.ticketId
          )
          const insertAt =
            input.after === null ? 0 : filtered.indexOf(input.after) + 1
          const nextTickets: ReadonlyArray<TicketId> = [
            ...filtered.slice(0, insertAt),
            input.ticketId,
            ...filtered.slice(insertAt)
          ]

          const now = yield* DateTime.nowAsDate

          const target: GroupDocument = {
            ...existing,
            tickets: nextTickets,
            updatedAt: now
          }
          yield* groupDocs.write(orgSlug, slug, id, target)
          return target
        })
      )

    const complete: GroupsShape["complete"] = (id, input) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
          const source = yield* groupDocs.read(orgSlug, slug, id)
          yield* requireGroupAction(source.kind, "manage")

          if (source.kind !== "sprint") {
            return yield* new Validation({ reason: "not_a_sprint" })
          }
          if (source.completedAt !== null) {
            return yield* new SprintCompletedImmutable()
          }

          let dest: GroupDocument | null = null
          if (input.destination.kind === "sprint") {
            if (input.destination.groupId === source.id) {
              return yield* new Validation({ reason: "destination_is_source" })
            }
            dest = yield* groupDocs.read(
              orgSlug,
              slug,
              input.destination.groupId
            )
            if (dest.kind !== "sprint") {
              return yield* new Validation({ reason: "destination_not_sprint" })
            }
            if (dest.completedAt !== null) {
              return yield* new SprintCompletedImmutable()
            }
          }

          const now = yield* DateTime.nowAsDate
          yield* validateCompletion(now, source.startsAt, now)

          const tickets = yield* Effect.forEach(
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
          )
          const stay: Array<TicketId> = []
          const carry: Array<TicketId> = []
          for (const ticket of tickets) {
            if (isCarryover(ticket.status)) carry.push(ticket.id)
            else stay.push(ticket.id)
          }

          if (dest !== null && carry.length > 0) {
            const merged = [...dest.tickets]
            for (const tid of carry) {
              if (!merged.includes(tid)) merged.push(tid)
            }
            const nextDest: GroupDocument = {
              ...dest,
              tickets: merged,
              updatedAt: now
            }
            yield* groupDocs.write(orgSlug, slug, dest.id, nextDest)
          }

          const nextSource: GroupDocument = {
            ...source,
            tickets: stay,
            completedAt: now,
            updatedAt: now
          }
          yield* groupDocs.write(orgSlug, slug, id, nextSource)
          return { target: nextSource, carried: carry }
        })
      )

    const remove: GroupsShape["remove"] = (id) =>
      lockedInScope(({ orgSlug, slug }) =>
        Effect.gen(function* () {
          const existing = yield* groupDocs.read(orgSlug, slug, id)
          yield* requireGroupAction(existing.kind, "manage")
          yield* groupDocs.remove(orgSlug, slug, id)
        })
      )

    const ensureSprintAssignable: GroupsShape["ensureSprintAssignable"] = (
      sprintIds
    ) =>
      Effect.gen(function* () {
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
      })

    const setSprintMembership = (
      orgSlug: string,
      slug: string,
      ticketId: TicketId,
      sprintId: GroupId | null,
      options?: { readonly after?: TicketId | null }
    ): Effect.Effect<void, MarkdownError> =>
      withGroupFilesLock(
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
                if (group.kind !== "sprint" || group.completedAt !== null) {
                  return
                }
                const present = group.tickets.includes(ticketId)
                const wanted = group.id === sprintId
                if (present === wanted) return

                const remaining = group.tickets.filter((t) => t !== ticketId)
                const after = options?.after
                const anchor =
                  after === undefined || after === null
                    ? -1
                    : remaining.indexOf(after)
                const next: GroupDocument = {
                  ...group,
                  tickets: wanted
                    ? after === null
                      ? [ticketId, ...remaining]
                      : anchor >= 0
                        ? [
                            ...remaining.slice(0, anchor + 1),
                            ticketId,
                            ...remaining.slice(anchor + 1)
                          ]
                        : [...remaining, ticketId]
                    : remaining,
                  updatedAt: yield* DateTime.nowAsDate
                }
                yield* groupDocs
                  .writeIfExists(orgSlug, slug, id, next)
                  .pipe(Effect.catchTag("NotFound", () => Effect.void))
              }),
            { concurrency: 1 }
          )
        })
      )

    const removeTicketFromAllGroups = (
      orgSlug: string,
      slug: string,
      ticketId: string
    ): Effect.Effect<void, MarkdownError> =>
      withGroupFilesLock(
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
                const next: GroupDocument = {
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

    return {
      list,
      listPaged,
      listSprintsPaged,
      get,
      create,
      update,
      updateTickets,
      addTickets,
      removeTickets,
      updateTicketOrder,
      complete,
      remove,
      ensureSprintAssignable,
      setSprintMembership,
      removeTicketFromAllGroups
    } satisfies GroupsShape
  })
)
