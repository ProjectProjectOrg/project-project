import { Ticket, TicketId } from "@pp/shared"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { expect, it, vi } from "vitest"

import { pointedTicket } from "@/features/command-menu/atoms/commandMenu"
import type { CommandEnv } from "@/features/command-menu/lib/commands"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

import { editTicket, openTicket } from "./commands"

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

const decodeTicketId = Schema.decodeSync(TicketId)

const ticket = { orgSlug: "acme", slug: "app", ticketId: row.id }

const environment = (
  registry: AtomRegistry.AtomRegistry,
  executed: Array<unknown>
): CommandEnv => ({
  registry,
  execute: (_atom, value) => {
    executed.push(value)
  },
  navigate: vi.fn<CommandEnv["navigate"]>(),
  copy: vi.fn<CommandEnv["copy"]>(),
  open: vi.fn<CommandEnv["open"]>(),
  actOn: vi.fn<CommandEnv["actOn"]>(),
  close: vi.fn<CommandEnv["close"]>()
})

it("edits a hovered row through the row's own patch, and other tickets through their detail", () => {
  const patch = vi.fn<(edit: TicketEdit) => void>()
  const registry = AtomRegistry.make({
    initialValues: [
      [pointedTicket, { ...ticket, row, patch, search: undefined }]
    ]
  })
  const executed: Array<unknown> = []
  const env = environment(registry, executed)

  editTicket(ticket, env, { flag: null })
  expect(patch).toHaveBeenCalledWith({ flag: null })
  expect(executed).toEqual([])

  editTicket({ ...ticket, ticketId: decodeTicketId("T-9") }, env, {
    flag: null
  })
  expect(patch).toHaveBeenCalledTimes(1)
  expect(executed).toEqual([{ flag: null }])
  registry.dispose()
})

it("opens a hovered row with the view it is listed in, so stepping follows that view", () => {
  const search = {
    from: "parent",
    parentId: decodeTicketId("T-1")
  } satisfies TicketNavigationSearch
  const registry = AtomRegistry.make({
    initialValues: [
      [pointedTicket, { ...ticket, row, patch: () => {}, search }]
    ]
  })
  const env = environment(registry, [])

  openTicket(ticket, env)

  expect(env.navigate).toHaveBeenCalledWith(
    `/orgs/acme/projects/app/tickets/${row.id}`,
    search
  )
  registry.dispose()
})
