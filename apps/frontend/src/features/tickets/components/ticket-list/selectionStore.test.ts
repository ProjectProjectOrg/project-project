import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import { emptySelection } from "@/features/tickets/lib/ticketSelection"

import { createSelectionStore, resetSelection } from "./selectionStore"

describe("resetSelection", () => {
  it("clears the selection and the bar's message but keeps what the lists recorded", () => {
    const registry = AtomRegistry.make()
    const store = createSelectionStore()
    const known = new Map<string, SelectedTicket>()
    registry.set(store.known, known)
    registry.set(store.selection, { keys: new Set(["app:T-1"]), anchor: null })
    registry.set(store.failure, { count: 1, retry: () => {} })
    registry.set(store.outcome, {
      count: 1,
      pending: false,
      selection: registry.get(store.selection)
    })

    resetSelection(registry, store)

    expect(registry.get(store.selection)).toBe(emptySelection)
    expect(registry.get(store.failure)).toBeNull()
    expect(registry.get(store.outcome)).toBeNull()
    expect(registry.get(store.known)).toBe(known)
  })
})
