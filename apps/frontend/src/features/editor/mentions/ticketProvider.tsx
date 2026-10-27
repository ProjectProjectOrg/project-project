import type { Ticket, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import {
  archivedEpicTitles,
  epicsRequest,
  openEpicTitles
} from "@/features/tickets/atoms/epics"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { EpicSeparator } from "@/features/tickets/components/ticket-list/EpicLabel"

import type { MentionCandidate, MentionProvider } from "./registry"

const NO_EPICS: ReadonlyMap<TicketId, string> = new Map()

const toCandidate =
  (epics: ReadonlyMap<TicketId, string>) =>
  (ticket: Ticket): MentionCandidate => {
    const epic = ticket.parent ? epics.get(ticket.parent) : undefined
    return epic === undefined
      ? { id: ticket.id, label: ticket.title }
      : { id: ticket.id, label: ticket.title, secondary: epic }
  }

export const ticketProvider = (
  scope: Readonly<{
    orgSlug: string
    slug: string
  }>
): MentionProvider => ({
  trigger: "#",
  type: "ticket",
  search: (query) => {
    if (!scope.orgSlug || !scope.slug) return Effect.succeed([])
    return Effect.gen(function* () {
      const results = yield* Atom.getResult(
        ticketSearch(
          searchRequest(scope.orgSlug, scope.slug, { q: query, limit: 8 })
        )
      )
      const parents = results.flatMap((ticket) =>
        ticket.parent ? [ticket.parent] : []
      )
      const req = epicsRequest(scope.orgSlug, scope.slug)
      const open =
        parents.length > 0
          ? yield* Atom.getResult(openEpicTitles(req)).pipe(
              Effect.orElseSucceed(() => NO_EPICS)
            )
          : NO_EPICS
      const archived = parents.some((parent) => !open.has(parent))
        ? yield* Atom.getResult(archivedEpicTitles(req)).pipe(
            Effect.orElseSucceed(() => NO_EPICS)
          )
        : NO_EPICS
      return results.map(toCandidate(new Map([...archived, ...open])))
    }).pipe(Effect.orElseSucceed(() => []))
  },
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono whitespace-nowrap">
        {candidate.id}
      </span>
      <span className="truncate text-muted-foreground">
        {candidate.secondary && (
          <>
            <span className="text-muted-foreground/80">
              {candidate.secondary}
            </span>
            <EpicSeparator />
          </>
        )}
        {candidate.label}
      </span>
    </div>
  )
})
