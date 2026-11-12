import type { BulkTicketPatch, TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { fireMutation } from "@/api/viewMutation"
import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { BulkTicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import {
  emptySelection,
  selectionKey,
  type TicketSelection
} from "@/features/tickets/lib/ticketSelection"

type SelectionFailure = Readonly<{ count: number; retry: () => void }>

export const createSelectionStore = () => {
  const selection = Atom.make<TicketSelection>(emptySelection)
  return {
    selection,
    count: Atom.map(selection, ({ keys }) => keys.size),
    isSelected: Atom.family((key: string) =>
      Atom.map(selection, ({ keys }) => keys.has(key))
    ),
    failure: Atom.make<SelectionFailure | null>(null),
    known: Atom.make<ReadonlyMap<string, SelectedTicket>>(new Map()),
    views: new Map<string, BulkTicketUpdateAtom>()
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
          retry: () => void updateSelected(registry, store, slug, ids, patch)
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
): void => {
  registry.set(store.failure, null)
  void fireMutation(registry, atom, input).then((result) => {
    if (!Result.isFailure(result)) return
    registry.set(store.failure, {
      count,
      retry: () => fireSelected(registry, store, atom, input, count)
    })
  })
}
