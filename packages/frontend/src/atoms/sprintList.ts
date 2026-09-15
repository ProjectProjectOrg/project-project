import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  GroupColor,
  GroupId,
  type CompleteSprintDestination,
  type CompleteSprintInput,
  type CreateGroupInput,
  type Group,
  type TicketId,
  type TicketStatus,
  type UpdateGroupInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { boardRequest, sprintBoard } from "./sprintBoard"

export interface SprintListRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const sprintListRequest = (
  orgSlug: string,
  slug: string
): SprintListRequest => ({ params: { orgSlug, slug } })

const scopeOf = (req: SprintListRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const sprintsQuery = (req: SprintListRequest) =>
  Api.query("groups", "list", {
    params: req.params,
    timeToLive: "1 minute",
    reactivityKeys: [Keys.sprints(scopeOf(req))]
  })

const sprintListQuery = (req: SprintListRequest) =>
  Atom.mapResult(sprintsQuery(req), (groups) =>
    groups.filter((group) => group.kind === "sprint")
  )

export const sprintList = Atom.family((req: SprintListRequest) =>
  Atom.optimistic(sprintListQuery(req))
)

/**
 * Derived from the optimistic wrapper with `Atom.mapResult`, so it inherits the
 * overlay and the hold for free. This is what retires
 * `pendingSprintAssignmentAtom`: that map existed only because the old
 * derivation read possibly-stale list data after the mutation settled.
 */
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

const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

let syntheticSprintCounter = 0
const nextSyntheticSprintId = (): GroupId =>
  makeGroupId(`G-${++syntheticSprintCounter + 9_999_000}`)

const buildSyntheticSprint = (input: CreateGroupInput): Group => {
  const now = DateTime.toDate(DateTime.nowUnsafe())
  return {
    id: nextSyntheticSprintId(),
    name: input.name,
    kind: input.kind ?? "sprint",
    tickets: input.tickets ?? [],
    color: input.color ?? makeGroupColor("#777777"),
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    completedAt: null,
    createdBy: "",
    createdAt: now,
    updatedAt: now
  }
}

export const createSprint = Atom.family((req: SprintListRequest) =>
  Atom.optimisticFn(sprintList(req), {
    reducer: (current, input: CreateGroupInput) =>
      AsyncResult.map(current, (sprints) => [
        buildSyntheticSprint(input),
        ...sprints
      ]),
    fn: Api.runtime.fn(
      Effect.fn(function* (input: CreateGroupInput) {
        return yield* Api.use((client) =>
          client.groups.create({ params: req.params, payload: input })
        )
      })
    )
  })
)

const applySprintPatch = (sprint: Group, patch: UpdateGroupInput): Group => ({
  ...sprint,
  name: patch.name ?? sprint.name,
  color: patch.color ?? sprint.color,
  startsAt: patch.startsAt !== undefined ? patch.startsAt : sprint.startsAt,
  endsAt: patch.endsAt !== undefined ? patch.endsAt : sprint.endsAt,
  completedAt:
    patch.completedAt !== undefined ? patch.completedAt : sprint.completedAt,
  updatedAt: DateTime.toDate(DateTime.nowUnsafe())
})

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
          sprints.map((sprint) =>
            sprint.id === groupId ? applySprintPatch(sprint, patch) : sprint
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateGroupInput, get) {
            const updated = yield* Api.use((client) =>
              client.groups.update({
                params: { ...req.params, id: groupId },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                sprints.map((sprint) =>
                  sprint.id === groupId ? updated : sprint
                )
              )
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
          sprints.filter((sprint) => sprint.id !== groupId)
        ),
      fn: Api.runtime.fn(
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

const splitCarryover = (
  ticketIds: ReadonlyArray<TicketId>,
  statuses: ReadonlyMap<TicketId, TicketStatus> | null
) => {
  if (!statuses)
    return { stay: [] as ReadonlyArray<TicketId>, carry: ticketIds }
  const stay: Array<TicketId> = []
  const carry: Array<TicketId> = []
  for (const id of ticketIds) {
    if (statuses.get(id) === "done") stay.push(id)
    else carry.push(id)
  }
  return { stay, carry }
}

const applyCompleteSprint = (
  sprints: ReadonlyArray<Group>,
  groupId: GroupId,
  destination: CompleteSprintDestination,
  statuses: ReadonlyMap<TicketId, TicketStatus> | null
): Array<Group> => {
  const source = sprints.find((sprint) => sprint.id === groupId)
  if (!source) return [...sprints]
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const { stay, carry } = splitCarryover(source.tickets, statuses)
  return sprints.map((sprint) => {
    if (sprint.id === groupId) {
      return { ...sprint, tickets: stay, completedAt: now, updatedAt: now }
    }
    if (destination.kind === "sprint" && sprint.id === destination.groupId) {
      const merged = [...sprint.tickets]
      for (const id of carry) {
        if (!merged.includes(id)) merged.push(id)
      }
      return { ...sprint, tickets: merged, updatedAt: now }
    }
    return sprint
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
      reducer: (current, input: CompleteSprintInput) =>
        AsyncResult.map(current, (sprints) =>
          applyCompleteSprint(sprints, groupId, input.destination, null)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: CompleteSprintInput, get) {
            const board = get(
              sprintBoard(
                boardRequest(req.params.orgSlug, req.params.slug, groupId)
              )
            )
            const statuses = AsyncResult.isSuccess(board)
              ? new Map(board.value.tickets.map((t) => [t.id, t.status]))
              : null
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                applyCompleteSprint(
                  sprints,
                  groupId,
                  input.destination,
                  statuses
                )
              )
            )
            const completed = yield* Api.use((client) =>
              client.groups.complete({
                params: { ...req.params, id: groupId },
                payload: input
              })
            )
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                sprints.map((sprint) =>
                  sprint.id === groupId ? completed : sprint
                )
              )
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scopeOf(req)),
              Keys.ticketsIn(scopeOf(req)),
              Keys.sprint(scopeOf(req), groupId)
            ])
            return completed
          })
        )
    })
)

interface TicketMembershipInput {
  readonly ticketIds: ReadonlyArray<TicketId>
}

export const addTicketsToSprint = Atom.family(
  ({
    req,
    groupId
  }: {
    readonly req: SprintListRequest
    readonly groupId: GroupId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, input: TicketMembershipInput) =>
        AsyncResult.map(current, (sprints) => {
          const incoming = new Set<TicketId>(input.ticketIds)
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((sprint) => {
            if (sprint.id === groupId) {
              const merged = [...sprint.tickets]
              for (const id of input.ticketIds) {
                if (!merged.includes(id)) merged.push(id)
              }
              return { ...sprint, tickets: merged, updatedAt: now }
            }
            if (sprint.completedAt !== null) return sprint
            const filtered = sprint.tickets.filter((id) => !incoming.has(id))
            if (filtered.length === sprint.tickets.length) return sprint
            return { ...sprint, tickets: filtered, updatedAt: now }
          })
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: TicketMembershipInput, get) {
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((sprint) => sprint.id === groupId)?.tickets ??
                [])
              : []
            const union = [...currentTickets]
            for (const id of input.ticketIds) {
              if (!union.includes(id)) union.push(id)
            }
            const result = yield* Api.use((client) =>
              client.groups.updateTickets({
                params: { ...req.params, id: groupId },
                payload: { tickets: union }
              })
            )
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                sprints.map((sprint) =>
                  sprint.id === groupId ? result.target : sprint
                )
              )
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scope),
              Keys.sprintMembership(scope, groupId),
              ...result.evicted.map((evicted) =>
                Keys.sprintMembership(scope, evicted.groupId)
              ),
              Keys.ticketLists(scope)
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
      reducer: (current, input: TicketMembershipInput) =>
        AsyncResult.map(current, (sprints) => {
          const drop = new Set<TicketId>(input.ticketIds)
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((sprint) =>
            sprint.id === groupId
              ? {
                  ...sprint,
                  tickets: sprint.tickets.filter((id) => !drop.has(id)),
                  updatedAt: now
                }
              : sprint
          )
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: TicketMembershipInput, get) {
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((sprint) => sprint.id === groupId)?.tickets ??
                [])
              : []
            const drop = new Set<TicketId>(input.ticketIds)
            const remaining = currentTickets.filter((id) => !drop.has(id))
            const result = yield* Api.use((client) =>
              client.groups.updateTickets({
                params: { ...req.params, id: groupId },
                payload: { tickets: remaining }
              })
            )
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                sprints.map((sprint) =>
                  sprint.id === groupId ? result.target : sprint
                )
              )
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scope),
              Keys.sprintMembership(scope, groupId),
              ...result.evicted.map((evicted) =>
                Keys.sprintMembership(scope, evicted.groupId)
              ),
              Keys.ticketLists(scope)
            ])
            return result
          })
        )
    })
)
