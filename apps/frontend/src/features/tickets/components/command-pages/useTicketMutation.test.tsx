import { RegistryContext } from "@effect/atom-react"
import { Ticket, TicketStatus } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { afterEach, expect, it, vi } from "vitest"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import { useTicketMutation } from "./useTicketMutation"

const row = Schema.decodeSync(Ticket)({
  id: "T-3",
  title: "Hovered",
  status: "todo",
  type: null,
  priority: "med",
  rank: "a0",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
})

const ticket = { orgSlug: "acme", slug: "app", ticketId: row.id }
const done = Schema.decodeSync(TicketStatus)("done")

let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
})

it("writes through the row the menu was opened on, and shows the edit at once", () => {
  const patch = vi.fn<(edit: TicketEdit) => void>()
  const active = Registry.make({
    initialValues: [
      [
        commandMenuState,
        openCommandMenu(ticket, "ticketStatus", [], { ...ticket, row, patch })
      ]
    ]
  })
  registry = active
  const { result } = renderHook(() => useTicketMutation(ticket), {
    wrapper: ({ children }) => (
      <RegistryContext.Provider value={active}>
        {children}
      </RegistryContext.Provider>
    )
  })

  act(() => result.current.update({ status: done }))

  expect(patch).toHaveBeenCalledWith({ status: done })
  expect(result.current.current?.status).toBe("done")
})
