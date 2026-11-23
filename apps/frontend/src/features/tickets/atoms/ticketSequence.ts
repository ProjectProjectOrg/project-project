import type { TicketId, TicketListSource, TicketSequence } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Predicate from "effect/Predicate"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"

import { query } from "@/api/query"

import {
  ticketSourceFromSearch,
  type TicketNavigationSearch
} from "../lib/ticketSearch"

export type TicketSequenceRequest = ReturnType<typeof ticketSequenceRequest>

export const ticketSequenceRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  from: TicketListSource | undefined
) =>
  ({
    _view: "ticketSequence",
    params: { orgSlug, slug, id },
    from
  }) as const

export const ticketSequence = Atom.family((req: TicketSequenceRequest) =>
  query("tickets", "sequence", {
    params: req.params,
    query: { from: req.from },
    timeToLive: "30 seconds"
  })
)

type ViewSequences = Readonly<{
  sequences: Map<string, TicketSequence>
  warmed: Set<string>
}>

const viewSequences = new WeakMap<AtomRegistry.AtomRegistry, ViewSequences>()

const viewSequencesIn = (registry: AtomRegistry.AtomRegistry) => {
  const known = viewSequences.get(registry)
  if (known !== undefined) return known
  const state: ViewSequences = { sequences: new Map(), warmed: new Set() }
  viewSequences.set(registry, state)
  return state
}

const viewKey = ({ params, from }: TicketSequenceRequest) =>
  JSON.stringify([params.orgSlug, params.slug, from])

export const rememberViewSequence = (
  registry: AtomRegistry.AtomRegistry,
  req: TicketSequenceRequest,
  sequence: TicketSequence | null
) => {
  if (req.from === undefined || sequence?.within !== "view") return
  viewSequencesIn(registry).sequences.set(viewKey(req), sequence)
}

export const knownViewSequence = (
  registry: AtomRegistry.AtomRegistry,
  req: TicketSequenceRequest
) => {
  const sequence = viewSequencesIn(registry).sequences.get(viewKey(req))
  return sequence?.tickets.some((ticket) => ticket.id === req.params.id)
    ? sequence
    : null
}

export const warmViewSequence = (
  registry: AtomRegistry.AtomRegistry,
  { orgSlug, slug }: Readonly<{ orgSlug: string; slug: string }>,
  from: TicketNavigationSearch,
  id: TicketId
) => {
  const { warmed } = viewSequencesIn(registry)
  const searchKey = JSON.stringify([orgSlug, slug, from])
  if (from.from === "parent" || warmed.has(searchKey)) return
  warmed.add(searchKey)
  const source = ticketSourceFromSearch(from)
  if (source === undefined || Predicate.isTagged(source, "parent")) return
  const req = ticketSequenceRequest(orgSlug, slug, id, source)
  if (viewSequencesIn(registry).sequences.has(viewKey(req))) return
  void Effect.runPromiseExit(
    AtomRegistry.getResult(registry, ticketSequence(req))
  ).then((exit) => {
    if (Exit.isSuccess(exit)) rememberViewSequence(registry, req, exit.value)
  })
}
