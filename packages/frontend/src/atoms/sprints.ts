import { Atom, Result } from "@effect-atom/atom-react"
import { Effect, Schema } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  GroupColor,
  GroupId,
  isCarryover,
  type CreateGroupInput,
  type Group,
  type GroupDetail,
  type TicketId,
  type UpdateGroupInput,
  type UpdateGroupTicketsOutput
} from "@projectproject/shared"
import {
  ticketsListAtom,
  ticketsListKey
} from "@/atoms/tickets"

export const projectKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

export const sprintKey = (
  orgSlug: string,
  slug: string,
  groupId: GroupId
) => `${orgSlug}/${slug}/${groupId}`

const splitProjectKey = (key: string): { orgSlug: string; slug: string } => {
  const idx = key.indexOf("/")
  return { orgSlug: key.slice(0, idx), slug: key.slice(idx + 1) }
}

const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

const splitSprintKey = (
  key: string
): { orgSlug: string; slug: string; groupId: GroupId } => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    groupId: makeGroupId(parts.slice(2).join("/"))
  }
}

const sprintsListBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        const all = yield* client.groups.list({ path: { orgSlug, slug } })
        return all.filter((g) => g.kind === "sprint")
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const sprintsListAtom = Atom.family((key: string) =>
  Atom.optimistic(sprintsListBaseAtom(key))
)

const sprintBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, groupId } = splitSprintKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.groups.get({
          path: { orgSlug, slug, id: groupId }
        })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const sprintAtom = Atom.family((key: string) =>
  Atom.optimistic(sprintBaseAtom(key))
)

type CreateSprintReducerInput = {
  name: string
  startsAt: Date
  endsAt: Date
}

const PENDING_PREFIX = "G-pending-"
let pendingNonce = 0
const nextPendingId = (): GroupId =>
  makeGroupId(`G-${++pendingNonce + 9_999_000}`) // far above realistic G-N ids; never collides

export const isPendingSprintId = (id: string): boolean =>
  id.startsWith(PENDING_PREFIX)

export const createSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: CreateSprintReducerInput) => {
      if (!Result.isSuccess(current)) return current
      const now = new Date()
      const synthetic: Group = {
        id: nextPendingId(),
        name: input.name,
        kind: "sprint",
        tickets: [],
        color: makeGroupColor("#777777"),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        completedAt: null,
        createdBy: "",
        createdAt: now,
        updatedAt: now
      }
      return Result.success([synthetic, ...current.value], { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: CreateSprintReducerInput, get) {
        const client = yield* ApiClient
        const payload: CreateGroupInput = {
          name: input.name,
          kind: "sprint",
          startsAt: input.startsAt,
          endsAt: input.endsAt
        }
        const created = yield* client.groups.create({
          path: { orgSlug, slug },
          payload
        })
        get.refresh(sprintsListBaseAtom(key))
        return created
      })
    )
  })
})

type UpdateSprintReducerInput = {
  groupId: GroupId
  patch: UpdateGroupInput
}

export const updateSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: UpdateSprintReducerInput) => {
      if (!Result.isSuccess(current)) return current
      const next = current.value.map((g) => {
        if (g.id !== input.groupId) return g
        return {
          ...g,
          name: input.patch.name ?? g.name,
          color: input.patch.color ?? g.color,
          startsAt:
            input.patch.startsAt !== undefined
              ? input.patch.startsAt
              : g.startsAt,
          endsAt:
            input.patch.endsAt !== undefined ? input.patch.endsAt : g.endsAt,
          completedAt:
            input.patch.completedAt !== undefined
              ? input.patch.completedAt
              : g.completedAt,
          updatedAt: new Date()
        }
      })
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: UpdateSprintReducerInput, get) {
        const client = yield* ApiClient
        const updated = yield* client.groups.update({
          path: { orgSlug, slug, id: input.groupId },
          payload: input.patch
        })
        get.refresh(sprintsListBaseAtom(key))
        get.refresh(sprintBaseAtom(sprintKey(orgSlug, slug, input.groupId)))
        return updated
      })
    )
  })
})

type AddTicketsReducerInput = {
  groupId: GroupId
  ticketIds: ReadonlyArray<TicketId>
}

export const addTicketsToSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: AddTicketsReducerInput) => {
      if (!Result.isSuccess(current)) return current
      const incoming = new Set<string>(input.ticketIds)
      const now = new Date()
      const next = current.value.map((g) => {
        if (g.id === input.groupId) {
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
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: AddTicketsReducerInput, get) {
        const client = yield* ApiClient
        const targetKey = sprintKey(orgSlug, slug, input.groupId)
        // Read current target tickets so we can full-replace with union.
        const list = get(sprintsListAtom(key))
        const currentTickets = Result.isSuccess(list)
          ? (list.value.find((g) => g.id === input.groupId)?.tickets ?? [])
          : []
        const union = [...currentTickets]
        for (const tid of input.ticketIds) {
          if (!union.includes(tid)) union.push(tid)
        }
        const result: UpdateGroupTicketsOutput = yield* client.groups.updateTickets({
          path: { orgSlug, slug, id: input.groupId },
          payload: { tickets: union }
        })
        get.refresh(sprintsListBaseAtom(key))
        get.refresh(sprintBaseAtom(targetKey))
        for (const ev of result.evicted) {
          get.refresh(sprintBaseAtom(sprintKey(orgSlug, slug, ev.groupId)))
        }
        return result
      })
    )
  })
})

type RemoveTicketsReducerInput = {
  groupId: GroupId
  ticketIds: ReadonlyArray<TicketId>
}

export const removeTicketsFromSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: RemoveTicketsReducerInput) => {
      if (!Result.isSuccess(current)) return current
      const drop = new Set<string>(input.ticketIds)
      const now = new Date()
      const next = current.value.map((g) => {
        if (g.id !== input.groupId) return g
        return {
          ...g,
          tickets: g.tickets.filter((tid) => !drop.has(tid)),
          updatedAt: now
        }
      })
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: RemoveTicketsReducerInput, get) {
        const client = yield* ApiClient
        const list = get(sprintsListAtom(key))
        const currentTickets = Result.isSuccess(list)
          ? (list.value.find((g) => g.id === input.groupId)?.tickets ?? [])
          : []
        const drop = new Set<string>(input.ticketIds)
        const remaining = currentTickets.filter((tid) => !drop.has(tid))
        const result = yield* client.groups.updateTickets({
          path: { orgSlug, slug, id: input.groupId },
          payload: { tickets: remaining }
        })
        get.refresh(sprintsListBaseAtom(key))
        get.refresh(sprintBaseAtom(sprintKey(orgSlug, slug, input.groupId)))
        return result
      })
    )
  })
})

export type CompleteSprintDestination =
  | { kind: "sprint"; groupId: GroupId }
  | { kind: "backlog" }

type CompleteSprintReducerInput = {
  groupId: GroupId
  destination: CompleteSprintDestination
  ticketStatuses: ReadonlyMap<TicketId, GroupDetail["tickets"][number] extends infer _ ? string : never>
}

// Pure helper: split a sprint's tickets into "stay" (status === done) and
// "carry" (status !== done) using the supplied status map. Tickets whose
// status is unknown are conservatively treated as carryover.
export function splitCarryover(
  ticketIds: ReadonlyArray<TicketId>,
  statuses: ReadonlyMap<string, string>
): { stay: ReadonlyArray<TicketId>; carry: ReadonlyArray<TicketId> } {
  const stay: Array<TicketId> = []
  const carry: Array<TicketId> = []
  for (const tid of ticketIds) {
    const status = statuses.get(tid)
    if (status === "done") stay.push(tid)
    else carry.push(tid)
  }
  return { stay, carry }
}

export const completeSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: CompleteSprintReducerInput) => {
      if (!Result.isSuccess(current)) return current
      const now = new Date()
      const source = current.value.find((g) => g.id === input.groupId)
      if (!source) return current
      const { stay, carry } = splitCarryover(
        source.tickets,
        new Map(
          [...input.ticketStatuses].map(([k, v]) => [k as string, v as string])
        )
      )
      const dest = input.destination
      const next = current.value.map((g) => {
        if (g.id === input.groupId) {
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
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: CompleteSprintReducerInput, get) {
        const client = yield* ApiClient
        const sourceKey = sprintKey(orgSlug, slug, input.groupId)
        const list = get(sprintsListAtom(key))
        const source = Result.isSuccess(list)
          ? list.value.find((g) => g.id === input.groupId)
          : undefined
        const sourceTickets: ReadonlyArray<TicketId> = source?.tickets ?? []
        const { stay, carry } = splitCarryover(
          sourceTickets,
          new Map(
            [...input.ticketStatuses].map(([k, v]) => [
              k as string,
              v as string
            ])
          )
        )

        const dest = input.destination
        if (dest.kind === "sprint" && carry.length > 0) {
          const destList = Result.isSuccess(list)
            ? list.value.find((g) => g.id === dest.groupId)
            : undefined
          const destCurrent = destList?.tickets ?? []
          const merged = [...destCurrent]
          for (const tid of carry) {
            if (!merged.includes(tid)) merged.push(tid)
          }
          yield* client.groups.updateTickets({
            path: { orgSlug, slug, id: dest.groupId },
            payload: { tickets: merged }
          })
        }

        yield* client.groups.updateTickets({
          path: { orgSlug, slug, id: input.groupId },
          payload: { tickets: stay }
        })

        const completed = yield* client.groups.update({
          path: { orgSlug, slug, id: input.groupId },
          payload: { completedAt: new Date() }
        })

        get.refresh(sprintsListBaseAtom(key))
        get.refresh(sprintBaseAtom(sourceKey))
        if (dest.kind === "sprint") {
          get.refresh(
            sprintBaseAtom(sprintKey(orgSlug, slug, dest.groupId))
          )
        }
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        return completed
      })
    )
  })
})

export const deleteSprintAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(sprintsListAtom(key), {
    reducer: (current, input: { groupId: GroupId }) => {
      if (!Result.isSuccess(current)) return current
      return Result.success(
        current.value.filter((g) => g.id !== input.groupId),
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (input: { groupId: GroupId }, get) {
        const client = yield* ApiClient
        yield* client.groups.delete({
          path: { orgSlug, slug, id: input.groupId }
        })
        get.refresh(sprintsListBaseAtom(key))
        return undefined
      })
    )
  })
})

export const sprintMembershipAtom = Atom.family((key: string) =>
  Atom.readable((get) => {
    const result = get(sprintsListAtom(key))
    if (!Result.isSuccess(result)) {
      return new Map<TicketId, Group>()
    }
    const map = new Map<TicketId, Group>()
    for (const sprint of result.value) {
      if (sprint.completedAt !== null) continue
      for (const tid of sprint.tickets) {
        if (!map.has(tid)) map.set(tid, sprint)
      }
    }
    return map
  })
)

export { isCarryover }
