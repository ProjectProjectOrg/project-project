import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import {
  ADMIN_GATED_KINDS,
  CompleteSprintInput,
  CreateGroupInput,
  Forbidden,
  Group,
  GroupColor,
  GroupDetail,
  GroupId,
  GroupKind,
  isCarryover,
  NotFound,
  SprintCompletedImmutable,
  TAG_DEFAULT_PALETTE,
  TicketId,
  UpdateGroupInput,
  UpdateGroupTicketsInput,
  UpdateGroupTicketsOutput,
  UpdateTicketOrderInput,
  Validation
} from "@projectproject/shared"
import { GroupDocs, type GroupDocument } from "../Services/GroupDocs"
import { Groups, type GroupsShape } from "../Services/Groups"
import type { MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
import { TicketDocs } from "../Services/TicketDocs"

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

export const GroupsLive = Layer.effect(
  Groups,
  Effect.gen(function* () {
    const groupDocs = yield* GroupDocs
    const ticketDocs = yield* TicketDocs
    const projects = yield* Projects

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

    const requireKindRole = (
      orgSlug: string,
      userId: string,
      slug: string,
      kind: GroupKind
    ): Effect.Effect<void, NotFound | Forbidden> =>
      Effect.gen(function* () {
        if (ADMIN_GATED_KINDS.has(kind)) {
          yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        } else {
          yield* projects.requireMember(orgSlug, userId, slug)
        }
      })

    const list = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Group>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const ids = yield* groupDocs.listIds(orgSlug, slug)
        const results = yield* Effect.forEach(
          ids,
          (id) => groupDocs.read(orgSlug, slug, id),
          { concurrency: 8 }
        )
        return results.map(documentToGroup).toSorted(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
      })

    const get = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<GroupDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        return yield* groupDocs.read(orgSlug, slug, id)
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: CreateGroupInput
    ): Effect.Effect<
      Group,
      NotFound | Forbidden | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        const kind: GroupKind = input.kind ?? "other"
        yield* requireKindRole(orgSlug, userId, slug, kind)

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

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const next: GroupDocument = { ...document, id: candidate }
          const result = yield* groupDocs.create(orgSlug, slug, next).pipe(
            Effect.map(() => "ok" as const),
            Effect.catchTag("GroupIdTaken", () =>
              Effect.succeed("retry" as const)
            )
          )
          if (result === "ok") {
            return documentToGroup(next)
          }
          const freshIds = yield* groupDocs.listIds(orgSlug, slug)
          candidate = nextIdFrom(freshIds)
        }
        return yield* Effect.die(
          new Error(`could not allocate group id for "${slug}"`)
        )
      })

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateGroupInput
    ): Effect.Effect<
      GroupDetail,
      NotFound | Forbidden | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.get(orgSlug, userId, slug)

        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)

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

    const updateTickets = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateGroupTicketsInput
    ): Effect.Effect<
      UpdateGroupTicketsOutput,
      NotFound | Forbidden | SprintCompletedImmutable | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        if (existing.completedAt !== null) {
          return yield* new SprintCompletedImmutable()
        }
        yield* validateTicketIds(orgSlug, slug, input.tickets)

        const now = yield* DateTime.nowAsDate
        const target: GroupDocument = {
          ...existing,
          tickets: input.tickets,
          updatedAt: now
        }

        const evicted: Array<{
          groupId: GroupId
          ticketIds: ReadonlyArray<TicketId>
        }> = []

        if (existing.kind === "sprint" && input.tickets.length > 0) {
          const incoming = new Set<string>(input.tickets)
          const allIds = yield* groupDocs.listIds(orgSlug, slug)
          const others = yield* Effect.forEach(
            allIds.filter((otherId) => otherId !== id),
            (otherId) => groupDocs.read(orgSlug, slug, otherId),
            { concurrency: 8 }
          )
          for (const other of others) {
            if (other.kind !== "sprint") continue
            if (other.completedAt !== null) continue
            const overlap = other.tickets.filter((tid) => incoming.has(tid))
            if (overlap.length === 0) continue
            const remaining = other.tickets.filter((tid) => !incoming.has(tid))
            const nextOther: GroupDocument = {
              ...other,
              tickets: remaining,
              updatedAt: now
            }
            yield* groupDocs.write(orgSlug, slug, other.id, nextOther)
            evicted.push({
              groupId: other.id,
              ticketIds: overlap as ReadonlyArray<TicketId>
            })
          }
        }

        yield* groupDocs.write(orgSlug, slug, id, target)
        return { target, evicted } satisfies UpdateGroupTicketsOutput
      })

    const updateTicketOrder = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: UpdateTicketOrderInput
    ): Effect.Effect<
      GroupDetail,
      NotFound | Forbidden | SprintCompletedImmutable | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        if (existing.completedAt !== null) {
          return yield* Effect.fail(new SprintCompletedImmutable())
        }
        if (input.after !== null && input.after === input.ticketId) {
          return yield* Effect.fail(new Validation({ reason: "after_is_self" }))
        }
        if (!existing.tickets.includes(input.ticketId)) {
          return yield* Effect.fail(new NotFound())
        }
        if (input.after !== null && !existing.tickets.includes(input.after)) {
          return yield* Effect.fail(new NotFound())
        }

        const filtered = existing.tickets.filter((tid) => tid !== input.ticketId)
        const insertAt =
          input.after === null ? 0 : filtered.indexOf(input.after) + 1
        const nextTickets: ReadonlyArray<TicketId> = [
          ...filtered.slice(0, insertAt),
          input.ticketId,
          ...filtered.slice(insertAt)
        ]

        const now = new Date()

        if (input.status !== undefined) {
          const ticket = yield* ticketDocs.read(orgSlug, slug, input.ticketId)
          if (ticket.status !== input.status) {
            yield* ticketDocs.write(orgSlug, slug, input.ticketId, {
              ...ticket,
              status: input.status,
              updatedAt: now
            })
          }
        }

        const target: GroupDocument = {
          ...existing,
          tickets: nextTickets,
          updatedAt: now
        }
        yield* groupDocs.write(orgSlug, slug, id, target)
        return target
      })

    const complete = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: CompleteSprintInput
    ): Effect.Effect<
      GroupDetail,
      NotFound | Forbidden | SprintCompletedImmutable | Validation | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const source = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, source.kind)

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

        const tickets = yield* Effect.forEach(
          source.tickets,
          (tid) => ticketDocs.read(orgSlug, slug, tid),
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
        return nextSource
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const existing = yield* groupDocs.read(orgSlug, slug, id)
        yield* requireKindRole(orgSlug, userId, slug, existing.kind)
        yield* groupDocs.remove(orgSlug, slug, id)
      })

    const removeTicketFromAllGroups = (
      orgSlug: string,
      slug: string,
      ticketId: string
    ): Effect.Effect<void, MarkdownError> =>
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

    return {
      list,
      get,
      create,
      update,
      updateTickets,
      updateTicketOrder,
      complete,
      remove,
      removeTicketFromAllGroups
    } satisfies GroupsShape
  })
)
