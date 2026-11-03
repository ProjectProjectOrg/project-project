import type { Ticket, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import {
  archivedEpicTitles,
  epicsRequest,
  openEpicTitles
} from "@/features/tickets/atoms/epics"
import {
  ticketMentionPage,
  ticketMentionPageRequest
} from "@/features/tickets/atoms/ticketMentions"
import { EpicSeparator } from "@/features/tickets/components/ticket-list/EpicLabel"
import { m } from "@/paraglide/messages"

import { MentionSearchFailed } from "./errors"
import type { MentionCandidate, MentionPage, MentionProvider } from "./registry"

const NO_EPICS: ReadonlyMap<TicketId, string> = new Map()
const NO_PAGE: MentionPage = { candidates: [], nextCursor: null }

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
  search: (query, cursor) => {
    if (!scope.orgSlug || !scope.slug) return Effect.succeed(NO_PAGE)
    return Effect.gen(function* () {
      const page = yield* Atom.getResult(
        ticketMentionPage(
          ticketMentionPageRequest(scope.orgSlug, scope.slug, query, cursor)
        )
      )
      const results = page.items.map((row) => row.ticket)
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
      return {
        candidates: results.map(toCandidate(new Map([...archived, ...open]))),
        nextCursor: page.nextCursor
      }
    }).pipe(Effect.mapError(() => new MentionSearchFailed()))
  },
  notes: {
    loading: () => m.tickets_mention_tickets_loading(),
    empty: () => m.tickets_mention_tickets_empty(),
    failed: () => m.tickets_mention_tickets_failed()
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
