import { RegistryContext } from "@effect/atom-react"
import { TicketId, TicketStatus } from "@pp/shared"
import { makeTicket } from "@pp/shared/tickets/testing"
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

const row = makeTicket({ id: TicketId.make("T-3") })

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
      patch: (edit) => patchRow?.(edit),
      search: undefined
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
