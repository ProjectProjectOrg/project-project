import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  GroupColor,
  GroupId,
  type CompleteSprintDestination,
  type CompleteSprintInput,
  type CompleteSprintOutput,
  type CreateGroupInput,
  type Group,
  type TicketId,
  type UpdateGroupInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { applySprintPatch } from "./sprintPatch"

export type SprintListRequest = {
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

const applyCompleteSprintResult = (
  sprints: ReadonlyArray<Group>,
  groupId: GroupId,
  destination: CompleteSprintDestination,
  result: CompleteSprintOutput
): Array<Group> => {
  const carried = new Set(result.carried)
  return sprints.map((sprint) => {
    if (sprint.id === groupId) return result.target
    if (destination.kind === "sprint" && sprint.id === destination.groupId) {
      const merged = [...sprint.tickets]
      for (const id of carried) {
        if (!merged.includes(id)) merged.push(id)
      }
      return {
        ...sprint,
        tickets: merged,
        updatedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
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
      reducer: (current, _input: CompleteSprintInput) =>
        AsyncResult.map(current, (sprints) =>
          sprints.map((sprint) =>
            sprint.id === groupId
              ? {
                  ...sprint,
                  completedAt: DateTime.toDate(DateTime.nowUnsafe())
                }
              : sprint
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: CompleteSprintInput, get) {
            const result = yield* Api.use((client) =>
              client.groups.complete({
                params: { ...req.params, id: groupId },
                payload: input
              })
            )
            set(
              AsyncResult.map(get(sprintList(req)), (sprints) =>
                applyCompleteSprintResult(
                  sprints,
                  groupId,
                  input.destination,
                  result
                )
              )
            )
            yield* Reactivity.invalidate([
              Keys.sprintMembership(scopeOf(req)),
              Keys.ticketsIn(scopeOf(req)),
              Keys.sprint(scopeOf(req), groupId),
              ...(input.destination.kind === "sprint"
                ? [Keys.sprint(scopeOf(req), input.destination.groupId)]
                : [])
            ])
            return result
          })
        )
    })
)

type SprintAssignmentInput = {
  readonly groupId: GroupId
}

export const addTicketsToSprint = Atom.family(
  ({
    req,
    ticketId
  }: {
    readonly req: SprintListRequest
    readonly ticketId: TicketId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, input: SprintAssignmentInput) =>
        AsyncResult.map(current, (sprints) => {
          const { groupId } = input
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((sprint) => {
            if (sprint.id === groupId) {
              if (sprint.tickets.includes(ticketId)) return sprint
              return {
                ...sprint,
                tickets: [...sprint.tickets, ticketId],
                updatedAt: now
              }
            }
            if (sprint.completedAt !== null) return sprint
            if (!sprint.tickets.includes(ticketId)) return sprint
            return {
              ...sprint,
              tickets: sprint.tickets.filter((id) => id !== ticketId),
              updatedAt: now
            }
          })
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: SprintAssignmentInput, get) {
            const { groupId } = input
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((sprint) => sprint.id === groupId)?.tickets ??
                [])
              : []
            const union = currentTickets.includes(ticketId)
              ? currentTickets
              : [...currentTickets, ticketId]
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

export const assignTicketToSprint = (
  registry: Registry.AtomRegistry,
  req: SprintListRequest,
  ticketId: TicketId,
  groupId: GroupId
): void => {
  const atom = addTicketsToSprint({ req, ticketId })
  const unmount = registry.mount(atom)
  registry.set(atom, { groupId })
  void Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true })
  ).finally(unmount)
}

export const removeTicketsFromSprint = Atom.family(
  ({
    req,
    ticketId
  }: {
    readonly req: SprintListRequest
    readonly ticketId: TicketId
  }) =>
    Atom.optimisticFn(sprintList(req), {
      reducer: (current, input: SprintAssignmentInput) =>
        AsyncResult.map(current, (sprints) => {
          const { groupId } = input
          const now = DateTime.toDate(DateTime.nowUnsafe())
          return sprints.map((sprint) =>
            sprint.id === groupId
              ? {
                  ...sprint,
                  tickets: sprint.tickets.filter((id) => id !== ticketId),
                  updatedAt: now
                }
              : sprint
          )
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: SprintAssignmentInput, get) {
            const { groupId } = input
            const scope = scopeOf(req)
            const list = get(sprintList(req))
            const currentTickets = AsyncResult.isSuccess(list)
              ? (list.value.find((sprint) => sprint.id === groupId)?.tickets ??
                [])
              : []
            const remaining = currentTickets.filter((id) => id !== ticketId)
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
