import {
  applyTicketDetailPatch,
  ProjectDetail,
  ProjectStatus,
  TicketDetail,
  type TicketId,
  type UpdateTicketInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { ServerAuth } from "@/auth/ServerAuth"
import { cacheSlot, ViewCache } from "@/cache/ViewCache"
import { myWorkKeys } from "@/myWork/atoms"
import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"
import type { OrgLocation } from "@/servers/model"

export type TicketLocation = OrgLocation &
  Readonly<{ projectSlug: string; ticketId: TicketId }>

export const ticketKeys = {
  ticket: (location: TicketLocation) =>
    [
      `orgs:${location.instanceId}:${location.orgSlug}:projects:${location.projectSlug}:tickets:${location.ticketId}`
    ] as const
}

const TicketSnapshot = Schema.Struct({
  ticket: TicketDetail,
  project: ProjectDetail,
  statuses: Schema.Array(ProjectStatus)
})
export type TicketSnapshot = typeof TicketSnapshot.Type

const snapshotSlot = (location: TicketLocation) =>
  cacheSlot(
    `ticket:${location.orgSlug}:${location.projectSlug}:${location.ticketId}`,
    TicketSnapshot
  )

const pathOf = (location: TicketLocation) => ({
  orgSlug: location.orgSlug,
  slug: location.projectSlug
})

const fetchSnapshot = Effect.fn("fetchTicket")(function* (
  location: TicketLocation
) {
  const auth = yield* ServerAuth
  const api = yield* auth.api(location.instanceId)
  const params = pathOf(location)
  const [ticket, project, statuses] = yield* Effect.all(
    [
      api.tickets.get({ params: { ...params, id: location.ticketId } }),
      api.projects.get({ params }),
      api.statuses.list({ params })
    ],
    { concurrency: "unbounded" }
  )
  return { ticket, project, statuses } satisfies TicketSnapshot
})

const ticketSource = (location: TicketLocation) =>
  appRuntime
    .atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const cache = yield* ViewCache
          const slot = snapshotSlot(location)
          const cached = yield* cache.read(location.instanceId, slot)
          const fresh = fetchSnapshot(location).pipe(
            Effect.tap((snapshot) =>
              cache.write(location.instanceId, slot, snapshot)
            )
          )
          return Stream.concat(
            Stream.fromIterable(Option.toArray(cached)),
            Stream.fromEffect(fresh)
          )
        })
      )
    )
    .pipe(
      Atom.withReactivity([
        ...ticketKeys.ticket(location),
        ...serverKeys.session(location.instanceId)
      ])
    )

export const ticketView = Atom.family((location: TicketLocation) =>
  Atom.optimistic(ticketSource(location))
)

export const updateTicket = Atom.family((location: TicketLocation) =>
  Atom.optimisticFn(ticketView(location), {
    reducer: (current, patch: UpdateTicketInput) =>
      AsyncResult.map(current, (snapshot) => ({
        ...snapshot,
        ticket: applyTicketDetailPatch(snapshot.ticket, patch)
      })),
    fn: (set) =>
      appRuntime.fn(
        Effect.fn("updateTicket")(function* (patch: UpdateTicketInput, get) {
          const auth = yield* ServerAuth
          const api = yield* auth.api(location.instanceId)
          const { ticket } = yield* api.tickets.update({
            params: { ...pathOf(location), id: location.ticketId },
            query: {},
            payload: patch
          })
          const current = AsyncResult.value(get(ticketView(location)))
          if (Option.isSome(current)) {
            set(AsyncResult.success({ ...current.value, ticket }))
          }
          yield* Reactivity.invalidate(myWorkKeys.tickets(location))
          return ticket
        })
      )
  })
)
