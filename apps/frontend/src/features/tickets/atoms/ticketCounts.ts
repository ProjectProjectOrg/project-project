import type { TicketCountQuery } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { localCounts } from "@/features/local/atoms/localBacklog"
import { localValue } from "@/features/local/atoms/readLocal"

export type CountsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketCountQuery
}>

export const countsRequest = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): CountsRequest => ({
  params: { orgSlug, slug },
  query
})

export const ticketCounts = Atom.family((req: CountsRequest) =>
  Atom.make((get) => localValue(get(localCounts(req))))
)
