// PR review page — renders the unified diff + file tree for the PR
// linked to a ticket. Backed by /projects/:slug/tickets/:id/review.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { ticketReviewAtom, reviewKey } from "@/atoms/reviews"
import type { TicketId } from "@projectproject/shared"

export const Route = createFileRoute(
  "/_authed/projects/$slug/tickets/$id/review"
)({
  component: ReviewPage,
  loader: () => ({
    crumb: { type: "static" as const, label: "Review" }
  })
})

function ReviewPage() {
  const { slug, id } = Route.useParams()
  const result = useAtomValue(
    ticketReviewAtom(reviewKey(slug, id as TicketId))
  )

  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">
        Review for {slug}/{id}
      </h1>
      <pre className="overflow-auto rounded bg-muted p-3 text-xs">
        {Result.matchWithError(result, {
          onInitial: () => "loading…",
          onError: (e) => `error: ${e._tag}`,
          onDefect: (d) => `defect: ${String(d)}`,
          onSuccess: ({ value }) => JSON.stringify(value, null, 2)
        })}
      </pre>
    </div>
  )
}
