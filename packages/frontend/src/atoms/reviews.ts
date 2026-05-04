import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type { TicketId } from "@projectproject/shared"

// One review-bundle atom per (slug, id). Keys are primitive strings
// `${slug}/${id}` to match `ticketAtom` in atoms/tickets.ts. Short TTL
// because PR state moves upstream; matches `projectGitStatesAtom`.
export const ticketReviewAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const slug = key.slice(0, idx)
  const id = key.slice(idx + 1) as TicketId
  return runtime
    .atom(
      Effect.gen(function*() {
        const client = yield* ApiClient
        return yield* client.reviews.getForTicket({ path: { slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const reviewKey = (slug: string, id: TicketId) => `${slug}/${id}`
