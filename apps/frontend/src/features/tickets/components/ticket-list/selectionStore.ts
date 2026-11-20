import type { BulkTicketPatch, TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { fireMutation } from "@/api/viewMutation"
import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { BulkTicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import { applySelectedEdit } from "@/features/tickets/lib/sharedTicketFields"
import { fromBulkPatch } from "@/features/tickets/lib/ticketPatch"
import {
  emptySelection,
  selectionKey,
  type TicketSelection
} from "@/features/tickets/lib/ticketSelection"

import { restoreOf, type Restore } from "./selectionUndo"

// A change that didn't land: how many tickets it missed, and a retry
// (resolving to whether it landed this time, when it can tell).
type SelectionFailure = Readonly<{
  count: number
  retry: () => Promise<boolean> | void
}>

// The last change to the selection, for the bar: on its way (pending),
// then landed, with its Undo (none when there's nothing to put back). It
// belongs to the selection it was made on; a new selection hides it.
type SelectionOutcome = Readonly<{
  count: number
  pending: boolean
  run?: () => void
  selection: TicketSelection
}>

// The store's own atoms are written before anything reads them (the lists
// record their tickets in `known` while no bar is up yet), so they keep
// their values with no subscribers (keepAlive).
export const createSelectionStore = () => {
  const selection = Atom.make<TicketSelection>(emptySelection).pipe(
    Atom.keepAlive
  )
  return {
    selection,
    count: Atom.map(selection, ({ keys }) => keys.size),
    isSelected: Atom.family((key: string) =>
      Atom.map(selection, ({ keys }) => keys.has(key))
    ),
    failure: Atom.make<SelectionFailure | null>(null).pipe(Atom.keepAlive),
    outcome: Atom.make<SelectionOutcome | null>(null).pipe(Atom.keepAlive),
    known: Atom.make<ReadonlyMap<string, SelectedTicket>>(new Map()).pipe(
      Atom.keepAlive
    ),
    views: new Map<string, BulkTicketUpdateAtom>(),
    orders: new Set<() => ReadonlyArray<string>>()
  }
}

export type SelectionStore = ReturnType<typeof createSelectionStore>

export const updateSelected = (
  registry: AtomRegistry,
  store: SelectionStore,
  slug: string,
  tickets: ReadonlyArray<TicketId>,
  patch: BulkTicketPatch
) => {
  const byView = new Map<BulkTicketUpdateAtom, Array<TicketId>>()
  for (const id of tickets) {
    const view = store.views.get(selectionKey(slug, id))
    if (view === undefined) return Promise.resolve(false)
    byView.set(view, [...(byView.get(view) ?? []), id])
  }
  registry.set(store.failure, null)
  return Promise.all(
    [...byView].map(([view, ids]) =>
      fireMutation(registry, view, { tickets: ids, patch }).then((result) => {
        if (!Result.isFailure(result)) return true
        registry.set(store.failure, {
          count: ids.length,
          retry: () => updateSelected(registry, store, slug, ids, patch)
        })
        return false
      })
    )
  ).then((results) => results.every(Boolean))
}

export const fireSelected = <I>(
  registry: AtomRegistry,
  store: SelectionStore,
  atom: Atom.Writable<Result.AsyncResult<unknown, unknown>, I>,
  input: I,
  count: number
) => {
  registry.set(store.failure, null)
  void fireMutation(registry, atom, input).then((result) => {
    if (!Result.isFailure(result)) return
    registry.set(store.failure, {
      count,
      retry: () => fireSelected(registry, store, atom, input, count)
    })
  })
}

// Applies a change to selected tickets, from the bar or ⌘K, at once: the
// list shows it straight away (and the store's copy of the tickets with
// it, so the bar reads the new values in the same render), and the bar
// says "Updated 3 tickets · Undo" while it's sent. If it doesn't land, the
// failure takes its place. Undo puts each ticket's old value back (one
// update per old value): the given restore, or, by default, what the
// store knows of the tickets before the change.
export const applySelected = (
  registry: AtomRegistry,
  store: SelectionStore,
  slug: string,
  tickets: ReadonlyArray<TicketId>,
  patch: BulkTicketPatch,
  restore: ReadonlyArray<Restore> = restoreOf(
    tickets.flatMap(
      (id) => registry.get(store.known).get(selectionKey(slug, id)) ?? []
    ),
    patch
  )
) => {
  const selection = registry.get(store.selection)
  const send = (ids: ReadonlyArray<TicketId>, change: BulkTicketPatch) => {
    const known = new Map(registry.get(store.known))
    for (const id of ids) {
      const key = selectionKey(slug, id)
      const ticket = known.get(key)
      if (ticket !== undefined)
        known.set(key, applySelectedEdit(ticket, fromBulkPatch(change)))
    }
    registry.set(store.known, known)
    return updateSelected(registry, store, slug, ids, change)
  }
  const sent = send(tickets, patch)
  registry.set(store.outcome, {
    count: tickets.length,
    pending: false,
    selection,
    run:
      restore.length === 0
        ? undefined
        : () => {
            for (const each of restore) void send(each.ids, each.patch)
            registry.set(store.outcome, null)
          }
  })
  return sent.then((ok) => {
    if (!ok) registry.set(store.outcome, null)
    return ok
  })
}
