import {
  type LiveCursor,
  type LiveEvent,
  NotFound,
  Ticket,
  TicketDetail,
  type TicketId,
  type TicketSync
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
  applyTicketPatch,
  type TicketEdit,
  toUpdateInput
} from "@/features/tickets/lib/ticketPatch"

import type { LocalPersistence } from "./persistence"

export type TicketRow = typeof Ticket.Encoded
export type DetailRow = typeof TicketDetail.Encoded

type Scope = Readonly<{ orgSlug: string; slug: string }>

const STALE_DETAILS_REFETCHED = 10

const encodeTicket = Schema.encodeSync(Ticket)
const encodeDetail = Schema.encodeSync(TicketDetail)
const decodeTicket = Schema.decodeSync(Ticket)
const decodeDetail = Schema.decodeSync(TicketDetail)
const isNotFound = Schema.is(NotFound)

const memo = <Row extends object, Value>(decode: (row: Row) => Value) => {
  const decoded = new WeakMap<Row, Value>()
  return (row: Row): Value => {
    const known = decoded.get(row)
    if (known !== undefined) return known
    const value = decode(row)
    decoded.set(row, value)
    return value
  }
}

export const decodeTicketRow = memo(decodeTicket)
export const decodeDetailRow = memo(decodeDetail)

export type FetchOutcome =
  | Readonly<{ _tag: "Found"; ticket: TicketDetail }>
  | Readonly<{ _tag: "Missing" }>

type RowsWriter = Readonly<{
  apply: (sync: TicketSync) => void
  upsert: (tickets: ReadonlyArray<Ticket>) => void
  remove: (ids: ReadonlyArray<string>) => void
}>

type DetailsWriter = Readonly<{
  upsert: (ticket: TicketDetail) => void
  remove: (ids: ReadonlyArray<string>) => void
}>

const readCursor = (value: unknown): LiveCursor | undefined =>
  typeof value === "string" ? value : undefined

let generation = 0

export const createLocalProject = ({
  client,
  scope,
  persistence
}: Readonly<{
  client: Api["Service"]
  scope: Scope
  persistence: LocalPersistence | null
}>) => {
  let rowsWriter: RowsWriter | null = null
  let detailsWriter: DetailsWriter | null = null
  let cursor: LiveCursor | undefined
  let report: (error: unknown) => void = () => {}
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromiseExit(effect)

  const persisted = <Row extends object>(
    options: CollectionConfig<Row, string>
  ) =>
    createCollection(
      persistence === null
        ? options
        : persistedCollectionOptions({
            ...options,
            persistence,
            schemaVersion: 1
          })
    )

  const details = persisted<DetailRow>({
    id: `ticket-details:${scope.orgSlug}/${scope.slug}`,
    getKey: (row) => row.id,
    startSync: true,
    sync: {
      rowUpdateMode: "full",
      sync: ({ collection, begin, write, commit, markReady }) => {
        detailsWriter = {
          upsert: (ticket) => {
            begin()
            write({
              type: collection.has(ticket.id) ? "update" : "insert",
              value: encodeDetail(ticket)
            })
            void commit()
          },
          remove: (ids) => {
            const present = ids.filter((id) => collection.has(id))
            if (present.length === 0) return
            begin()
            for (const id of present) write({ type: "delete", key: id })
            void commit()
          }
        }
        markReady()
        return () => {
          detailsWriter = null
        }
      }
    }
  })

  const fetchDetail = async (id: TicketId): Promise<FetchOutcome> => {
    const exit = await run(client.tickets.get({ params: { ...scope, id } }))
    if (Exit.isSuccess(exit)) {
      detailsWriter?.upsert(exit.value)
      if (rows.get(id)?.updatedAt !== encodeTicket(exit.value).updatedAt)
        rowsWriter?.upsert([exit.value])
      return { _tag: "Found", ticket: exit.value }
    }
    if (Option.exists(Cause.findErrorOption(exit.cause), isNotFound)) {
      detailsWriter?.remove([id])
      rowsWriter?.remove([id])
      return { _tag: "Missing" }
    }
    throw new Error(`Couldn't load ${id}`, { cause: exit.cause })
  }

  const rows = persisted<TicketRow>({
    id: `ticket-rows:${scope.orgSlug}/${scope.slug}`,
    getKey: (row) => row.id,
    startSync: true,
    sync: {
      rowUpdateMode: "full",
      sync: ({
        collection,
        begin,
        write,
        commit,
        truncate,
        markReady,
        reportError,
        metadata
      }) => {
        cursor = readCursor(metadata?.collection.get("cursor"))
        const upsertAll = (tickets: ReadonlyArray<Ticket>) => {
          for (const ticket of tickets) {
            const known = collection.get(ticket.id)
            write({
              type: known === undefined ? "insert" : "update",
              value: { ...known, ...encodeTicket(ticket) }
            })
          }
        }
        rowsWriter = {
          apply: (result) => {
            begin()
            if (result.mode === "full") {
              truncate()
              for (const ticket of result.rows)
                write({ type: "insert", value: encodeTicket(ticket) })
            } else {
              upsertAll(result.rows)
              for (const id of result.removed)
                if (collection.has(id)) write({ type: "delete", key: id })
            }
            metadata?.collection.set("cursor", result.cursor)
            void commit()
            cursor = result.cursor
          },
          upsert: (tickets) => {
            begin()
            upsertAll(tickets)
            void commit()
          },
          remove: (ids) => {
            const present = ids.filter((id) => collection.has(id))
            if (present.length === 0) return
            begin()
            for (const id of present) write({ type: "delete", key: id })
            void commit()
          }
        }

        let ready = false
        const becomeReady = () => {
          if (ready) return
          ready = true
          report = reportError
          markReady()
        }
        if (collection.size > 0) becomeReady()

        const stop = onLiveEvent(handle)
        queueMicrotask(() => {
          syncNow().then(becomeReady, (error: unknown) => {
            becomeReady()
            reportError(error)
          })
        })

        return () => {
          stop()
          rowsWriter = null
        }
      }
    }
  })

  const staleDetails = (result: TicketSync): ReadonlyArray<string> => {
    const changed =
      result.mode === "delta"
        ? [...result.rows.map((row) => row.id), ...result.removed]
        : [...details.keys()].map(String)
    return changed.filter((id) => {
      const detail = details.get(id)
      if (detail === undefined) return false
      const row = rows.get(id)
      return row === undefined || row.updatedAt !== detail.updatedAt
    })
  }

  const reconcileDetails = (result: TicketSync) => {
    const stale = staleDetails(result)
    if (stale.length === 0) return
    if (stale.length > STALE_DETAILS_REFETCHED) {
      detailsWriter?.remove(stale)
      return
    }
    for (const id of stale) void fetchDetail(id as TicketId).catch(report)
  }

  const movedParents = (result: TicketSync): ReadonlyArray<string> => {
    if (result.mode === "full") return []
    const next = new Map(
      result.rows.map((row) => [row.id, row.parent?.id ?? null])
    )
    const parents: Array<string> = []
    for (const id of [...next.keys(), ...result.removed]) {
      const before = rows.get(id)?.parent?.id ?? null
      if (before !== null && before !== next.get(id)) parents.push(before)
    }
    return parents
  }

  let running: Promise<void> | null = null
  let again = false
  const extra = new Set<string>()

  const syncOnce = async () => {
    const ids = [...extra]
    extra.clear()
    const exit = await run(
      client.tickets.sync({
        params: scope,
        query: {
          after: cursor,
          ids: ids.length === 0 ? undefined : ids.join(",")
        }
      })
    )
    if (Exit.isFailure(exit))
      throw new Error("Couldn't sync the project's tickets", {
        cause: exit.cause
      })
    const parents = movedParents(exit.value)
    rowsWriter?.apply(exit.value)
    reconcileDetails(exit.value)
    if (parents.length > 0) {
      for (const id of parents) extra.add(id)
      again = true
    }
  }

  const syncNow = (): Promise<void> => {
    if (running !== null) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          await syncOnce()
        } while (again)
      } finally {
        running = null
      }
    })()
    return running
  }

  function handle(event: LiveEvent) {
    if (event.kind === "heartbeat") return
    if (event.kind === "resync") {
      cursor = undefined
      void syncNow().catch(report)
      return
    }
    if (event.orgSlug !== scope.orgSlug || event.slug !== scope.slug) return
    if (event.kind === "comments") return
    void syncNow().catch(report)
  }

  const updateTicket = createOptimisticAction<
    Readonly<{ id: TicketId; edit: TicketEdit }>
  >({
    onMutate: ({ id, edit }) => {
      const row = rows.get(id)
      if (row !== undefined) {
        const next = encodeTicket(applyTicketPatch(decodeTicketRow(row), edit))
        rows.update(id, (draft) => {
          Object.assign(draft, next)
        })
      }
      const detail = details.get(id)
      if (detail !== undefined) {
        const next = encodeDetail(
          applyTicketDetailPatch(decodeDetailRow(detail), edit)
        )
        details.update(id, (draft) => {
          Object.assign(draft, next)
        })
      }
    },
    mutationFn: async ({ id, edit }) => {
      const exit = await run(
        client.tickets.update({
          params: { ...scope, id },
          query: {},
          payload: toUpdateInput(edit)
        })
      )
      if (Exit.isFailure(exit))
        throw new Error(`Couldn't save ${id}`, { cause: exit.cause })
      detailsWriter?.upsert(exit.value.ticket)
      rowsWriter?.upsert([exit.value.ticket])
      return exit.value
    }
  })

  return {
    rows,
    details,
    fetchDetail,
    syncNow,
    updateTicket,
    generation: generation++
  }
}

export type LocalProject = ReturnType<typeof createLocalProject>
