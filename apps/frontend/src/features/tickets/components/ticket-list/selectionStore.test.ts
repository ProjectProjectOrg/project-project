import { TicketId, type BulkUpdateTicketsInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import {
  emptySelection,
  selectionKey
} from "@/features/tickets/lib/ticketSelection"

import {
  applySelected,
  createSelectionStore,
  resetSelection
} from "./selectionStore"

const ticketId = Schema.decodeSync(TicketId)
const remove = () => Promise.resolve(Exit.void)

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

describe("applySelected", () => {
  it("keeps a newer edit's Undo when an earlier edit fails", async () => {
    const registry = AtomRegistry.make()
    const store = createSelectionStore()
    const first = ticketId("APP-1")
    const second = ticketId("APP-2")
    store.views.set(selectionKey("app", first), {
      bulk: Atom.fn((_: BulkUpdateTicketsInput) =>
        Effect.fail("rejected").pipe(Effect.delay("5 millis"))
      ),
      remove
    })
    store.views.set(selectionKey("app", second), {
      bulk: Atom.fn((_: BulkUpdateTicketsInput) => Effect.never),
      remove
    })

    const failing = applySelected(registry, store, "app", [first], {
      priority: "high"
    })
    resetSelection(registry, store)
    void applySelected(registry, store, "app", [second], { priority: "high" })
    const newer = registry.get(store.outcome)
    await failing

    expect(newer).not.toBeNull()
    expect(registry.get(store.outcome)).toBe(newer)
  })
})
