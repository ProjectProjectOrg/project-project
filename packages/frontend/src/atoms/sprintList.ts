import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import {
  GroupColor,
  GroupId,
  type CompleteSprintDestination,
  type CompleteSprintInput,
  type CreateGroupInput,
  type Group,
  type TicketId,
  type UpdateGroupInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { boardRequest, sprintBoard, splitCarryover } from "./sprintBoard"

export interface SprintListRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const sprintListRequest = (
  orgSlug: string,
  slug: string
): SprintListRequest => ({ params: { orgSlug, slug } })

const scopeOf = (req: SprintListRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

type SprintListItem = Group & { readonly body?: string }

const sprintListQuery = (req: SprintListRequest) =>
  Api.query("groups", "list", {
    params: req.params,
    timeToLive: "1 minute",
    reactivityKeys: [Keys.sprints(scopeOf(req))]
  })

const sprintListView = (req: SprintListRequest) =>
  Atom.mapResult(sprintListQuery(req), (groups) =>
    groups.filter((g) => g.kind === "sprint")
  )

export const sprintList = Atom.family((req: SprintListRequest) =>
  Atom.optimistic(sprintListView(req))
)

let pendingNonce = 0
const nextPendingId = (): GroupId =>
  makeGroupId(`G-${++pendingNonce + 9_999_000}`)

export const createSprint = Atom.family((req: SprintListRequest) =>
  Atom.optimisticFn(sprintList(req), {
    reducer: (current, input: CreateGroupInput) =>
      AsyncResult.map(current, (sprints) => {
        const now = DateTime.toDate(DateTime.nowUnsafe())
        const synthetic: SprintListItem = {
          id: nextPendingId(),
          name: input.name,
          kind: "sprint",
          tickets: input.tickets ?? [],
          color: input.color ?? makeGroupColor("#777777"),
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: "",
          createdAt: now,
          updatedAt: now
        }
        return [synthetic, ...sprints]
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: CreateGroupInput) {
          const created = yield* Api.use((client) =>
            client.groups.create({
              params: req.params,
              payload: { ...input, kind: "sprint" }
            })
          )
          return created
        })
      )
  })
)

export const updateSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, patch: UpdateGroupInput) =>
        AsyncResult.map(current, (sprints) =>
          sprints.map((g) => {
            if (g.id !== groupId) return g
            const now = DateTime.toDate(DateTime.nowUnsafe())
            return {
              ...g,
              name: patch.name ?? g.name,
              body: patch.body ?? g.body,
              color: patch.color ?? g.color,
              startsAt:
                patch.startsAt !== undefined ? patch.startsAt : g.startsAt,
              endsAt: patch.endsAt !== undefined ? patch.endsAt : g.endsAt,
              completedAt:
                patch.completedAt !== undefined
                  ? patch.completedAt
                  : g.completedAt,
              updatedAt: now
            }
          })
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateGroupInput) {
            const updated = yield* Api.use((client) =>
              client.groups.update({
                params: { ...req.params, id: groupId },
                payload: patch
              })
            )
            yield* Reactivity.invalidate([Keys.sprint(scopeOf(req), groupId)])
            return updated
          })
        )
    })
)

export const deleteSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (sprints) =>
          sprints.filter((g) => g.id !== groupId)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            yield* Api.use((client) =>
              client.groups.delete({ params: { ...req.params, id: groupId } })
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scopeOf(req)),
              Keys.sprint(scopeOf(req), groupId)
            ])
          })
        )
    })
)

const completeReducer = (
  sprints: ReadonlyArray<SprintListItem>,
  groupId: GroupId,
  input: CompleteSprintInput,
  statuses: ReadonlyMap<string, string>
): ReadonlyArray<SprintListItem> => {
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const source = sprints.find((g) => g.id === groupId)
  if (!source) return sprints
  const { stay, carry } = splitCarryover(source.tickets, statuses)
  const dest = input.destination
  return sprints.map((g) => {
    if (g.id === groupId) {
      return { ...g, tickets: stay, completedAt: now, updatedAt: now }
    }
    if (dest.kind === "sprint" && g.id === dest.groupId) {
      const merged = [...g.tickets]
      for (const tid of carry) {
        if (!merged.includes(tid)) merged.push(tid)
      }
      return { ...g, tickets: merged, updatedAt: now }
    }
    return g
  })
}

export const completeSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, _input: CompleteSprintInput) =>
        AsyncResult.isSuccess(current)
          ? AsyncResult.success(current.value, { waiting: true })
          : current,
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: CompleteSprintInput, get) {
            const scope = scopeOf(req)
            const boardReq = boardRequest(
              req.params.orgSlug,
              req.params.slug,
              groupId
            )
            const board = get(sprintBoard(boardReq))
            const statuses = AsyncResult.isSuccess(board)
              ? new Map(board.value.tickets.map((t) => [t.id, t.status]))
              : new Map<string, string>()

            const list = get(sprintList(req))
            if (AsyncResult.isSuccess(list)) {
              set(
                AsyncResult.success(
                  completeReducer(list.value, groupId, input, statuses),
                  { waiting: true }
                )
              )
            }

            const completed = yield* Api.use((client) =>
              client.groups.complete({
                params: { ...req.params, id: groupId },
                payload: input
              })
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scope),
              Keys.sprintMembership(scope, groupId),
              Keys.sprint(scope, groupId),
              Keys.ticketsIn(scope),
              ...(input.destination.kind === "sprint"
                ? [
                    Keys.sprintMembership(scope, input.destination.groupId),
                    Keys.sprint(scope, input.destination.groupId)
                  ]
                : [])
            ])
            return completed
          })
        )
    })
)

export const sprintMembership = Atom.family((req: SprintListRequest) =>
  Atom.mapResult(sprintList(req), (sprints) => {
    const map = new Map<TicketId, Group>()
    for (const sprint of sprints) {
      if (sprint.completedAt !== null) continue
      for (const id of sprint.tickets) if (!map.has(id)) map.set(id, sprint)
    }
    return map
  })
)

export const addTicketsToSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, input: { ticketIds: ReadonlyArray<TicketId> }) =>
        AsyncResult.map(current, (sprints) => {
          const incoming = new Set(input.ticketIds)
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((g) => {
            if (g.id === groupId) {
              const merged = [...g.tickets]
              for (const tid of input.ticketIds) {
                if (!merged.includes(tid)) merged.push(tid)
              }
              return { ...g, tickets: merged, updatedAt: now }
            }
            if (g.completedAt !== null) return g
            const filtered = g.tickets.filter((tid) => !incoming.has(tid))
            if (filtered.length === g.tickets.length) return g
            return { ...g, tickets: filtered, updatedAt: now }
          })
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (
            input: { ticketIds: ReadonlyArray<TicketId> },
            get
          ) {
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((g) => g.id === groupId)?.tickets ?? [])
              : []
            const union = [...currentTickets]
            for (const tid of input.ticketIds) {
              if (!union.includes(tid)) union.push(tid)
            }
            const result = yield* Api.use((client) =>
              client.groups.updateTickets({
                params: { ...req.params, id: groupId },
                payload: { tickets: union }
              })
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scope),
              Keys.sprintMembership(scope, groupId),
              Keys.sprint(scope, groupId),
              Keys.ticketLists(scope),
              ...result.evicted.map((ev) =>
                Keys.sprintMembership(scope, ev.groupId)
              )
            ])
            return result
          })
        )
    })
)

export const removeTicketsFromSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, input: { ticketIds: ReadonlyArray<TicketId> }) =>
        AsyncResult.map(current, (sprints) => {
          const drop = new Set(input.ticketIds)
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((g) => {
            if (g.id !== groupId) return g
            return {
              ...g,
              tickets: g.tickets.filter((tid) => !drop.has(tid)),
              updatedAt: now
            }
          })
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (
            input: { ticketIds: ReadonlyArray<TicketId> },
            get
          ) {
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((g) => g.id === groupId)?.tickets ?? [])
              : []
            const drop = new Set(input.ticketIds)
            const remaining = currentTickets.filter((tid) => !drop.has(tid))
            const result = yield* Api.use((client) =>
              client.groups.updateTickets({
                params: { ...req.params, id: groupId },
                payload: { tickets: remaining }
              })
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scope),
              Keys.sprintMembership(scope, groupId),
              Keys.sprint(scope, groupId),
              Keys.ticketLists(scope)
            ])
            return result
          })
        )
    })
)

export type { CompleteSprintDestination }
