import {
  ProjectDetail,
  ProjectStatus,
  TicketDetail,
  type TicketId,
  type UpdateTicketInput
} from "@pp/shared"
import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { ServerAuth } from "@/auth/ServerAuth"
import { cacheSlot, ViewCache } from "@/cache/ViewCache"
import type { OrgLocation } from "@/servers/model"

export type TicketLocation = OrgLocation &
  Readonly<{ projectSlug: string; ticketId: TicketId }>

export const TicketSnapshot = Schema.Struct({
  ticket: TicketDetail,
  project: ProjectDetail,
  statuses: Schema.Array(ProjectStatus)
})
export type TicketSnapshot = typeof TicketSnapshot.Type

export const snapshotSlot = (location: TicketLocation) =>
  cacheSlot(
    `ticket:${location.orgSlug}:${location.projectSlug}:${location.ticketId}`,
    TicketSnapshot
  )

export const pathOf = (location: TicketLocation) => ({
  orgSlug: location.orgSlug,
  slug: location.projectSlug
})

const prefetchConcurrency = 3

export class TicketSnapshots extends Context.Service<TicketSnapshots>()(
  "@pp/mobile/tickets/TicketSnapshots",
  {
    make: Effect.gen(function* () {
      const auth = yield* ServerAuth
      const views = yield* ViewCache

      const fetchSnapshot = Effect.fn("fetchTicket")(function* (
        location: TicketLocation
      ) {
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
        const snapshot = { ticket, project, statuses } satisfies TicketSnapshot
        yield* views.write(
          location.instanceId,
          snapshotSlot(location),
          snapshot
        )
        return snapshot
      })

      const inFlight = yield* Cache.make({
        lookup: fetchSnapshot,
        capacity: 64,
        timeToLive: "10 seconds"
      })

      const load = (location: TicketLocation) =>
        Cache.get(inFlight, location).pipe(
          Effect.tapError(() => Cache.invalidate(inFlight, location))
        )

      const prefetchOne = (location: TicketLocation) =>
        views.read(location.instanceId, snapshotSlot(location)).pipe(
          Effect.flatMap(
            Option.match({
              onSome: () => Effect.void,
              onNone: () => Effect.ignore(load(location))
            })
          )
        )

      const prefetch = (locations: ReadonlyArray<TicketLocation>) =>
        Effect.forEach(locations, prefetchOne, {
          concurrency: prefetchConcurrency,
          discard: true
        })

      const update = Effect.fn("updateTicket")(function* (
        location: TicketLocation,
        patch: UpdateTicketInput
      ) {
        const api = yield* auth.api(location.instanceId)
        const { ticket } = yield* api.tickets.update({
          params: { ...pathOf(location), id: location.ticketId },
          query: {},
          payload: patch
        })
        const slot = snapshotSlot(location)
        const saved = yield* views.read(location.instanceId, slot)
        if (Option.isSome(saved)) {
          const snapshot = { ...saved.value, ticket } satisfies TicketSnapshot
          yield* views.write(location.instanceId, slot, snapshot)
          yield* Cache.set(inFlight, location, snapshot)
        } else {
          yield* Cache.invalidate(inFlight, location)
        }
        return ticket
      })

      return { load, prefetch, update }
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
