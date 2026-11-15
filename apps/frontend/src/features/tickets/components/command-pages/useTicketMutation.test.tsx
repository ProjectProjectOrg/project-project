import { RegistryContext } from "@effect/atom-react"
import { Ticket, TicketStatus } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { useState, type ReactNode } from "react"
import { afterEach, expect, it } from "vitest"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import {
  applyTicketPatch,
  type TicketEdit
} from "@/features/tickets/lib/ticketPatch"

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

it("shows the row's live value, also on a page reopened after an edit", () => {
  const active = Registry.make()
  registry = active
  let patchRow: ((edit: TicketEdit) => void) | null = null
  active.set(
    commandMenuState,
    openCommandMenu(ticket, "ticketStatus", [], {
      ...ticket,
      row,
      patch: (edit) => patchRow?.(edit)
    })
  )
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <RegistryContext.Provider value={active}>
      {children}
    </RegistryContext.Provider>
  )
  renderHook(
    () => {
      const [value, setValue] = useState(row)
      patchRow = (edit) =>
        setValue((current) => applyTicketPatch(current, edit))
      usePointedTicket("acme", "app", value, patchRow)
    },
    { wrapper }
  )
  const page = renderHook(() => useTicketMutation(ticket), { wrapper })

  act(() => page.result.current.update({ status: done }))
  expect(page.result.current.current?.status).toBe("done")

  page.unmount()
  const reopened = renderHook(() => useTicketMutation(ticket), { wrapper })
  expect(reopened.result.current.current?.status).toBe("done")
})
