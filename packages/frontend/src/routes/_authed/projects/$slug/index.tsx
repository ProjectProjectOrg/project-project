// Default tab — search/filter/sort/expand-inline ticket list.
//
// Stats live in the layout header; this view is just the list.

import { createFileRoute } from "@tanstack/react-router"
import { TicketList } from "@/components/TicketList"
import { useProject } from "./-context"

// Search params are validated loosely so the inline-expand state survives
// reloads and is shareable. `ticket` holds the currently expanded id.
export const Route = createFileRoute("/_authed/projects/$slug/")({
  component: TicketsTab,
  validateSearch: (
    search: Record<string, unknown>
  ): { ticket?: string; focusBody?: number } => ({
    ticket: typeof search.ticket === "string" ? search.ticket : undefined,
    // One-shot signal from CreateTicketRow → ExpandedDetail to autoFocus
    // the body editor on the freshly-created ticket. Number so it round-
    // trips through validateSearch without pruning.
    focusBody: search.focusBody === 1 ? 1 : undefined
  })
})

function TicketsTab() {
  const { slug } = Route.useParams()
  const project = useProject()
  // `members` is the source of truth for who can be assigned and how to
  // render an assignee (id → name lookup). Pass it through rather than
  // re-fetching inside TicketList so the same project context drives the
  // tab strip's count and the tickets view's assignee resolution.
  return <TicketList slug={slug} members={project.members} />
}
