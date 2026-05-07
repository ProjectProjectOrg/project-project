import { Effect } from "effect"
import { ApiClient } from "@/services/ApiClient"
import type { MentionProvider } from "./registry"

export const ticketMentionProvider: MentionProvider = {
  trigger: "#",
  type: "ticket",
  search: (query, scope) =>
    Effect.gen(function* () {
      if (!scope.orgSlug || !scope.slug) return []
      const client = yield* ApiClient
      const tickets = yield* client.tickets.list({
        path: { orgSlug: scope.orgSlug, slug: scope.slug }
      })
      const q = query.toLowerCase()
      return tickets
        .filter(
          (t) =>
            t.id.toLowerCase().includes(q) ||
            t.title.toLowerCase().includes(q)
        )
        .slice(0, 8)
        .map((t) => ({ id: t.id, label: t.title }))
    }),
  renderRow: (c) => (
    <div className="flex items-center gap-2">
      <span className="font-mono">{c.id}</span>
      <span className="text-muted-foreground">{c.label}</span>
    </div>
  ),
  renderChip: (ref) => (
    <span className="bg-accent text-accent-foreground rounded px-1 py-0.5 font-mono text-sm">
      {ref.id}
    </span>
  )
}
