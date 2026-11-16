import { EPIC_TYPE } from "@pp/shared"
import type { Ticket, TicketSort } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { localTicketQuery } from "@/features/local/atoms/localTicketQuery"
import { localOrderKey } from "@/features/tickets/lib/ticketRows"
import { compareCodePoints } from "@/lib/orderKey"

export type EpicsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const epicsRequest = (orgSlug: string, slug: string): EpicsRequest => ({
  params: { orgSlug, slug }
})

const EPIC_SORT: TicketSort = { key: "title", dir: "asc" }

const byTitle = (a: Ticket, b: Ticket) =>
  compareCodePoints(localOrderKey(a, EPIC_SORT), localOrderKey(b, EPIC_SORT))

export const projectEpics = Atom.family((req: EpicsRequest) =>
  localTicketQuery(req.params, {
    where: {
      kind: "test",
      test: (ticket) => ticket.type === EPIC_TYPE && ticket.archivedAt === null
    },
    select: (epics) => [...epics].sort(byTitle)
  })
)
