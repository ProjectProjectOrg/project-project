import {
  GroupColor,
  GroupId,
  type CompleteSprintDestination,
  type CompleteSprintInput,
  type CompleteSprintOutput,
  type CreateGroupInput,
  type Group,
  type QuickCreateTicketInput,
  type TicketId,
  type UpdateGroupInput,
  type UpdateGroupTicketsOutput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import { fireMutation, keepPredicted, viewMutation } from "@/api/viewMutation"

import { applySprintPatch } from "./sprintPatch"

export type SprintListRequest = Readonly<{
  _view: "sprintList"
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const sprintListRequest = (
  orgSlug: string,
  slug: string
): SprintListRequest => ({ _view: "sprintList", params: { orgSlug, slug } })

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

const confirmCreatedSprint = (
  sprints: ReadonlyArray<Group>,
  input: CreateGroupInput,
  created: Group
): Array<Group> => {
  let replaced = false
  const next: Array<Group> = []
  for (const sprint of sprints) {
    if (!replaced && sprint.createdBy === "" && sprint.name === input.name) {
      replaced = true
      next.push(created)
      continue
    }
    if (sprint.id !== created.id) next.push(sprint)
  }
  return replaced ? next : [created, ...sprints]
}

export const createSprint = Atom.family((req: SprintListRequest) =>
  viewMutation(sprintList(req), {
    name: "createSprint",
    predict: (sprints, input: CreateGroupInput) => [
      buildSyntheticSprint(input),
      ...sprints
    ],
    call: (client, input) =>
      client.groups.create({ params: req.params, payload: input }),
    confirm: (sprints, created, input) =>
      confirmCreatedSprint(sprints, input, created)
  })
)

type SprintKey = Readonly<{
  req: SprintListRequest
  groupId: GroupId
}>

const replaceSprint = (
  sprints: ReadonlyArray<Group>,
  groupId: GroupId,
  update: (sprint: Group) => Group
) => sprints.map((sprint) => (sprint.id === groupId ? update(sprint) : sprint))

export const updateSprint = Atom.family(({ req, groupId }: SprintKey) =>
  viewMutation(sprintList(req), {
    name: "updateSprint",
    predict: (sprints, patch: UpdateGroupInput) =>
      replaceSprint(sprints, groupId, (sprint) =>
        applySprintPatch(sprint, patch)
      ),
    call: (client, patch) =>
      client.groups.update({
        params: { ...req.params, id: groupId },
        payload: patch
      }),
    confirm: (sprints, updated) =>
      replaceSprint(sprints, groupId, () => updated),
    publish: () => [Keys.sprint(scopeOf(req), groupId)]
  })
)

const withoutSprint = (sprints: ReadonlyArray<Group>, groupId: GroupId) =>
  sprints.filter((sprint) => sprint.id !== groupId)

export const deleteSprint = Atom.family(({ req, groupId }: SprintKey) =>
  viewMutation(sprintList(req), {
    name: "deleteSprint",
    predict: (sprints, _input: void) => withoutSprint(sprints, groupId),
    call: (client) =>
      client.groups.delete({ params: { ...req.params, id: groupId } }),
    confirm: (sprints) => withoutSprint(sprints, groupId),
    publish: () => [
      Keys.sprintMembership(scopeOf(req)),
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprint(scopeOf(req), groupId)
    ]
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

export const completeSprint = Atom.family(({ req, groupId }: SprintKey) =>
  viewMutation(sprintList(req), {
    name: "completeSprint",
    predict: (sprints, _input: CompleteSprintInput) =>
      replaceSprint(sprints, groupId, (sprint) => ({
        ...sprint,
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      })),
    call: (client, input) =>
      client.groups.complete({
        params: { ...req.params, id: groupId },
        payload: input
      }),
    confirm: (sprints, result, input) =>
      applyCompleteSprintResult(sprints, groupId, input.destination, result),
    publish: (_result, input) => [
      Keys.sprintMembership(scopeOf(req)),
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprint(scopeOf(req), groupId),
      ...(input.destination.kind === "sprint"
        ? [Keys.sprint(scopeOf(req), input.destination.groupId)]
        : [])
    ]
  })
)

type SprintAssignmentInput = Readonly<{
  groupId: GroupId
}>

type SprintTicketKey = Readonly<{
  req: SprintListRequest
  ticketId: TicketId
}>

const confirmAddedTickets = (
  sprints: ReadonlyArray<Group>,
  groupId: GroupId,
  ticketIds: ReadonlyArray<TicketId>,
  result: UpdateGroupTicketsOutput
): Array<Group> => {
  const evicted = new Map(
    result.evicted.map((entry) => [entry.groupId, new Set(entry.ticketIds)])
  )
  return sprints.map((sprint) => {
    if (sprint.id === groupId) {
      return {
        ...result.target,
        tickets: [
          ...sprint.tickets,
          ...ticketIds.filter((id) => !sprint.tickets.includes(id))
        ]
      }
    }
    const dropped = evicted.get(sprint.id)
    if (dropped === undefined) return sprint
    return {
      ...sprint,
      tickets: sprint.tickets.filter((id) => !dropped.has(id))
    }
  })
}

const confirmRemovedTicket = (
  sprints: ReadonlyArray<Group>,
  groupId: GroupId,
  ticketId: TicketId,
  result: UpdateGroupTicketsOutput
): Array<Group> =>
  sprints.map((sprint) =>
    sprint.id === groupId
      ? {
          ...result.target,
          tickets: sprint.tickets.filter((id) => id !== ticketId)
        }
      : sprint
  )

const membershipKeys = (
  scope: string,
  groupId: GroupId,
  result: UpdateGroupTicketsOutput
): ReadonlyArray<ReactivityKey> => [
  Keys.sprintMembership(scope),
  Keys.sprintMembership(scope, groupId),
  Keys.sprint(scope, groupId),
  ...result.evicted.map((evicted) =>
    Keys.sprintMembership(scope, evicted.groupId)
  ),
  ...result.evicted.map((evicted) => Keys.sprint(scope, evicted.groupId)),
  Keys.ticketsIn(scope),
  Keys.ticketLists(scope)
]

export const addTicketsToSprint = Atom.family(
  ({ req, ticketId }: SprintTicketKey) =>
    viewMutation(sprintList(req), {
      name: "addTicketsToSprint",
      predict: (sprints, { groupId }: SprintAssignmentInput) => {
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
      },
      call: (client, { groupId }) =>
        client.groups.addTickets({
          params: { ...req.params, id: groupId },
          payload: { tickets: [ticketId] }
        }),
      confirm: (sprints, result, { groupId }) =>
        confirmAddedTickets(sprints, groupId, [ticketId], result),
      publish: (result, { groupId }) =>
        membershipKeys(scopeOf(req), groupId, result)
    })
)

export type BulkSprintAssignmentInput = Readonly<{
  groupId: GroupId
  tickets: ReadonlyArray<TicketId>
}>

export const bulkAddTicketsToSprint = Atom.family((req: SprintListRequest) =>
  viewMutation(sprintList(req), {
    name: "bulkAddTicketsToSprint",
    predict: (sprints, input: BulkSprintAssignmentInput) => {
      const now = DateTime.toDate(DateTime.nowUnsafe())
      return sprints.map((sprint) => {
        if (sprint.id === input.groupId) {
          return {
            ...sprint,
            tickets: [
              ...sprint.tickets,
              ...input.tickets.filter((id) => !sprint.tickets.includes(id))
            ],
            updatedAt: now
          }
        }
        if (sprint.completedAt !== null) return sprint
        if (!sprint.tickets.some((id) => input.tickets.includes(id))) {
          return sprint
        }
        return {
          ...sprint,
          tickets: sprint.tickets.filter((id) => !input.tickets.includes(id)),
          updatedAt: now
        }
      })
    },
    call: (client, input) =>
      client.tickets.bulkUpdate({
        params: req.params,
        payload: { tickets: input.tickets, patch: { sprint: input.groupId } }
      }),
    confirm: (sprints, result, input) =>
      result.sprint === null
        ? sprints
        : confirmAddedTickets(
            sprints,
            input.groupId,
            input.tickets,
            result.sprint
          ),
    publish: (result, input) =>
      result.sprint === null
        ? Keys.ticketsChanged(scopeOf(req))
        : membershipKeys(scopeOf(req), input.groupId, result.sprint)
  })
)

export const assignTicketToSprint = (
  registry: Registry.AtomRegistry,
  req: SprintListRequest,
  ticketId: TicketId,
  groupId: GroupId
): void => {
  void fireMutation(registry, addTicketsToSprint({ req, ticketId }), {
    groupId
  })
}

export const removeTicketsFromSprint = Atom.family(
  ({ req, ticketId }: SprintTicketKey) =>
    viewMutation(sprintList(req), {
      name: "removeTicketsFromSprint",
      predict: (sprints, { groupId }: SprintAssignmentInput) =>
        replaceSprint(sprints, groupId, (sprint) => ({
          ...sprint,
          tickets: sprint.tickets.filter((id) => id !== ticketId),
          updatedAt: DateTime.toDate(DateTime.nowUnsafe())
        })),
      call: (client, { groupId }) =>
        client.groups.removeTickets({
          params: { ...req.params, id: groupId },
          payload: { tickets: [ticketId] }
        }),
      confirm: (sprints, result, { groupId }) =>
        confirmRemovedTicket(sprints, groupId, ticketId, result),
      publish: (result, { groupId }) =>
        membershipKeys(scopeOf(req), groupId, result)
    })
)

export const sprintAssignmentKeys = (
  scope: string,
  groupId: GroupId | undefined
): ReadonlyArray<ReactivityKey> => [
  Keys.sprints(scope),
  Keys.sprintMembership(scope),
  ...(groupId === undefined
    ? []
    : [Keys.sprintMembership(scope, groupId), Keys.sprint(scope, groupId)])
]

export const createInSprint = Effect.fnUntraced(function* (
  params: SprintListRequest["params"],
  payload: QuickCreateTicketInput,
  groupId: GroupId | undefined
) {
  const created = yield* Api.use((client) =>
    client.tickets.quickCreate({ params, payload })
  )
  const assignment = yield* Effect.exit(
    groupId === undefined
      ? Effect.void
      : Api.use((client) =>
          client.groups.addTickets({
            params: { ...params, id: groupId },
            payload: { tickets: [created.id] }
          })
        )
  )
  return { ...created, sprintAssignmentFailed: Exit.isFailure(assignment) }
})

export const quickCreateInSprint = Atom.family(({ req, groupId }: SprintKey) =>
  viewMutation(sprintList(req), {
    name: "quickCreateInSprint",
    predict: (sprints, _payload: QuickCreateTicketInput) =>
      keepPredicted(sprints),
    call: (_client, payload) => createInSprint(req.params, payload, groupId),
    confirm: (sprints, created) =>
      created.sprintAssignmentFailed
        ? sprints
        : replaceSprint(sprints, groupId, (sprint) =>
            sprint.tickets.includes(created.id)
              ? sprint
              : { ...sprint, tickets: [...sprint.tickets, created.id] }
          ),
    publish: () => [
      ...Keys.ticketsChanged(scopeOf(req)),
      ...sprintAssignmentKeys(scopeOf(req), groupId)
    ]
  })
)
