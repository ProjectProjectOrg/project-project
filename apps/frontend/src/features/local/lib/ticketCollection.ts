import {
  type LiveEvent,
  NotFound,
  TicketDetail,
  type TicketId
} from "@pp/shared"
import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence"
import {
  type CollectionConfig,
  createCollection,
  createOptimisticAction
} from "@tanstack/react-db"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import type { Api } from "@/api/Api"
import { onLiveEvent } from "@/features/live/lib/liveEvents"
import {
  applyTicketDetailPatch,
  type TicketEdit,
  toUpdateInput
} from "@/features/tickets/lib/ticketPatch"

import type { LocalPersistence } from "./persistence"

export type TicketRow = typeof TicketDetail.Encoded

type Scope = Readonly<{ orgSlug: string; slug: string }>

type Writer = Readonly<{
  upsert: (ticket: TicketDetail) => void
  remove: (id: string) => void
  replaceAll: (tickets: ReadonlyArray<TicketDetail>) => void
}>

const encode = Schema.encodeSync(TicketDetail)
const decodeRow = Schema.decodeSync(TicketDetail)
const decoded = new WeakMap<TicketRow, TicketDetail>()

export const decodeTicketRow = (row: TicketRow): TicketDetail => {
  const known = decoded.get(row)
  if (known !== undefined) return known
  const ticket = decodeRow(row)
  decoded.set(row, ticket)
  return ticket
}

const isNotFound = Schema.is(NotFound)

export type FetchOutcome =
  | Readonly<{ _tag: "Found"; ticket: TicketDetail }>
  | Readonly<{ _tag: "Missing" }>

let generation = 0

export const createLocalTickets = ({
  client,
  scope,
  persistence
}: Readonly<{
  client: Api["Service"]
  scope: Scope
  persistence: LocalPersistence | null
}>) => {
  let writer: Writer | null = null
  let report: (error: unknown) => void = () => {}
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect)

  const fetchOne = async (id: TicketId): Promise<FetchOutcome> => {
    const exit = await run(client.tickets.get({ params: { ...scope, id } }))
    if (Exit.isSuccess(exit)) {
      writer?.upsert(exit.value)
      return { _tag: "Found", ticket: exit.value }
    }
    if (Option.exists(Cause.findErrorOption(exit.cause), isNotFound)) {
      writer?.remove(id)
      return { _tag: "Missing" }
    }
    throw new Error(`Couldn't load ${id}`, { cause: exit.cause })
  }

  const fetchAll = async () => {
    const exit = await run(client.tickets.snapshot({ params: scope }))
    if (Exit.isFailure(exit))
      throw new Error("Couldn't load the project's tickets", {
        cause: exit.cause
      })
    writer?.replaceAll(exit.value)
  }

  const applies = (event: LiveEvent) =>
    event.kind === "resync" ||
    (event.kind !== "heartbeat" &&
      event.orgSlug === scope.orgSlug &&
      event.slug === scope.slug)

  const handle = (event: LiveEvent) => {
    if (!applies(event)) return
    if (event.kind === "ticket") return void fetchOne(event.id).catch(report)
    if (event.kind === "comments") return
    void fetchAll().catch(report)
  }

  const options: CollectionConfig<TicketRow, string> = {
    id: `tickets:${scope.orgSlug}/${scope.slug}`,
    getKey: (row) => row.id,
    startSync: true,
    sync: {
      rowUpdateMode: "full",
      sync: ({
        collection,
        begin,
        write,
        commit,
        markReady,
        truncate,
        reportError
      }) => {
        writer = {
          upsert: (ticket) => {
            begin()
            write({
              type: collection.has(ticket.id) ? "update" : "insert",
              value: encode(ticket)
            })
            void commit()
          },
          remove: (id) => {
            if (!collection.has(id)) return
            begin()
            write({ type: "delete", key: id })
            void commit()
          },
          replaceAll: (tickets) => {
            begin()
            truncate()
            for (const ticket of tickets)
              write({ type: "insert", value: encode(ticket) })
            void commit()
          }
        }

        const buffered: Array<LiveEvent> = []
        let loaded = false
        const stop = onLiveEvent((event) => {
          if (loaded) handle(event)
          else buffered.push(event)
        })

        fetchAll()
          .then(() => {
            loaded = true
            report = reportError
            markReady()
            for (const event of buffered) handle(event)
          })
          .catch((error: unknown) => {
            loaded = true
            report = reportError
            markReady()
            reportError(error)
          })

        return () => {
          stop()
          writer = null
        }
      }
    }
  }

  const collection = createCollection(
    persistence === null
      ? options
      : persistedCollectionOptions({
          ...options,
          persistence,
          schemaVersion: 1
        })
  )

  const queues = new Map<string, Promise<unknown>>()
  const serialized = <A>(id: string, task: () => Promise<A>) => {
    const next = (queues.get(id) ?? Promise.resolve()).then(task, task)
    queues.set(id, next)
    return next
  }

  const updateTicket = createOptimisticAction<
    Readonly<{ id: TicketId; edit: TicketEdit }>
  >({
    onMutate: ({ id, edit }) => {
      const current = collection.get(id)
      if (current === undefined) return
      const next = encode(
        applyTicketDetailPatch(decodeTicketRow(current), edit)
      )
      collection.update(id, (draft) => {
        Object.assign(draft, next)
      })
    },
    mutationFn: ({ id, edit }) =>
      serialized(id, async () => {
        const exit = await run(
          client.tickets.update({
            params: { ...scope, id },
            query: {},
            payload: toUpdateInput(edit)
          })
        )
        if (Exit.isFailure(exit))
          throw new Error(`Couldn't save ${id}`, { cause: exit.cause })
        writer?.upsert(exit.value.ticket)
        return exit.value
      })
  })

  return { collection, fetchOne, updateTicket, generation: generation++ }
}

export type LocalTickets = ReturnType<typeof createLocalTickets>
