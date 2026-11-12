import { isEpic } from "@pp/shared"
import type { Ticket } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import {
  ticketPage,
  ticketPageRequest
} from "@/features/tickets/atoms/ticketPages"
import { EpicSeparator } from "@/features/tickets/components/ticket-list/EpicLabel"
import { m } from "@/paraglide/messages"

import { MentionSearchFailed } from "./errors"
import type { MentionCandidate, MentionPage, MentionProvider } from "./registry"

const NO_PAGE: MentionPage = { items: [], nextCursor: null }

const toCandidate = (ticket: Ticket): MentionCandidate =>
  isEpic(ticket.parent)
    ? { id: ticket.id, label: ticket.title, secondary: ticket.parent.title }
    : { id: ticket.id, label: ticket.title }

export const ticketProvider = (
  scope: Readonly<{
    orgSlug: string
    slug: string
  }>
): MentionProvider => ({
  type: "ticket",
  search: (query, cursor) => {
    if (!scope.orgSlug || !scope.slug) return Effect.succeed(NO_PAGE)
    return Effect.gen(function* () {
      const page = yield* Atom.getResult(
        ticketPage(ticketPageRequest(scope.orgSlug, scope.slug, query, cursor))
      )
      return {
        items: page.items.map((row) => toCandidate(row.ticket)),
        nextCursor: page.nextCursor
      }
    }).pipe(Effect.mapError(() => new MentionSearchFailed()))
  },
  heading: () => m.tickets_mention_tickets_heading(),
  failed: () => m.tickets_mention_tickets_failed(),
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-(--row-key-width) shrink-0 font-mono whitespace-nowrap">
        {candidate.id}
      </span>
      <span className="truncate text-muted-foreground">
        {candidate.secondary && (
          <>
            <span className="text-muted-foreground">{candidate.secondary}</span>
            <EpicSeparator />
          </>
        )}
        {candidate.label}
      </span>
    </div>
  )
})
