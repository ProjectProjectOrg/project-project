import {
  applyTicketPatch,
  TicketId,
  type Project,
  type ProjectStatus,
  type Ticket,
  type UpdateTicketInput
} from "@pp/shared"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { ViewCache } from "@/cache/ViewCache"
import { myWorkKeys } from "@/myWork/atoms"
import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"

import {
  snapshotSlot,
  type TicketLocation,
  type TicketSnapshot,
  TicketSnapshots
} from "./TicketSnapshots"

export type { TicketLocation } from "./TicketSnapshots"

export const ticketKeys = {
  ticket: (location: TicketLocation) =>
    [
      `orgs:${location.instanceId}:${location.orgSlug}:projects:${location.projectSlug}:tickets:${location.ticketId}`
    ] as const
}

type Person = Readonly<{ id: string; name: string }>

export type TicketView = Readonly<{
  ticket: Ticket & Readonly<{ body: string | null }>
  project: Pick<Project, "slug" | "name" | "icon">
  people: ReadonlyArray<Person> | null
  statuses: ReadonlyArray<ProjectStatus>
}>

export type TicketPreview = Readonly<{
  ticket: Ticket
  project: Project
  statuses: ReadonlyArray<ProjectStatus>
  viewer: Person | null
}>

export const ticketPreview = Atom.family((_location: TicketLocation) =>
  Atom.make(Option.none<TicketPreview>()).pipe(Atom.setIdleTTL("1 minute"))
)

const fromSnapshot = ({ ticket, project, statuses }: TicketSnapshot) => {
  const view: TicketView = {
    ticket,
    project,
    people: project.members,
    statuses
  }
  return view
}

const fromPreview = ({ ticket, project, statuses, viewer }: TicketPreview) => {
  const view: TicketView = {
    ticket: { ...ticket, body: null },
    project,
    people:
      viewer !== null && ticket.assignees.includes(viewer.id) ? [viewer] : null,
    statuses
  }
  return view
}

const ticketSource = (location: TicketLocation) =>
  appRuntime
    .atom((get) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const cache = yield* ViewCache
          const slot = snapshotSlot(location)
          const cached = yield* cache.read(location.instanceId, slot)
          const first = Option.orElse(Option.map(cached, fromSnapshot), () =>
            Option.map(get.once(ticketPreview(location)), fromPreview)
          )
          const snapshots = yield* TicketSnapshots
          const fresh = snapshots.load(location).pipe(Effect.map(fromSnapshot))
          return Stream.concat(
            Stream.fromIterable(Option.toArray(first)),
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
      AsyncResult.map(current, (view) => ({
        ...view,
        ticket: {
          ...applyTicketPatch(view.ticket, patch),
          body: patch.body ?? view.ticket.body
        }
      })),
    fn: (set) =>
      appRuntime.fn(
        Effect.fn("updateTicket")(function* (patch: UpdateTicketInput, get) {
          const snapshots = yield* TicketSnapshots
          const ticket = yield* snapshots.update(location, patch)
          const current = AsyncResult.value(get(ticketView(location)))
          if (Option.isSome(current)) {
            const view: TicketView = { ...current.value, ticket }
            set(AsyncResult.success(view))
          }
          yield* Reactivity.invalidate(myWorkKeys.tickets(location))
          return ticket
        })
      )
  })
)

export const prefetchTickets = appRuntime.fn(
  Effect.fn("prefetchTickets")(function* (
    locations: ReadonlyArray<TicketLocation>
  ) {
    const snapshots = yield* TicketSnapshots
    yield* snapshots.prefetch(locations)
  })
)

export type MentionedTicket = Readonly<{ status: string }>

const isTicketId = Schema.is(TicketId)

export const mentionedTickets = Atom.family(
  (target: Readonly<{ from: TicketLocation; ids: ReadonlyArray<string> }>) =>
    appRuntime
      .atom(
        Effect.gen(function* () {
          const cache = yield* ViewCache
          const snapshots = yield* TicketSnapshots
          const found = yield* Effect.forEach(
            target.ids.filter(isTicketId),
            (ticketId) => {
              const location = { ...target.from, ticketId }
              return cache
                .read(location.instanceId, snapshotSlot(location))
                .pipe(
                  Effect.flatMap(
                    Option.match({
                      onSome: Effect.succeed,
                      onNone: () => snapshots.load(location)
                    })
                  ),
                  Effect.map(({ ticket }) => {
                    const mentioned: MentionedTicket = { status: ticket.status }
                    return [ticketId, mentioned] as const
                  }),
                  Effect.option
                )
            },
            { concurrency: 3 }
          )
          return new Map(Arr.getSomes(found))
        })
      )
      .pipe(Atom.setIdleTTL("5 minutes"))
)
