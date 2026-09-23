import type { Ticket } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"

import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"

import type { MentionCandidate, MentionProvider } from "./registry"

const toCandidate = (ticket: Ticket): MentionCandidate => ({
  id: ticket.id,
  label: ticket.title
})

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
      return results.map(toCandidate)
    }).pipe(Effect.orElseSucceed(() => []))
  },
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono whitespace-nowrap">
        {candidate.id}
      </span>
      <span className="truncate text-muted-foreground">{candidate.label}</span>
    </div>
  )
})
