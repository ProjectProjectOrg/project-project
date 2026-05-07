import { Effect } from "effect"
import { ApiClient } from "@/services/ApiClient"
import type { MentionProvider } from "./registry"

export const userMentionProvider: MentionProvider = {
  trigger: "@",
  type: "user",
  search: (query) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const me = yield* client.auth.me()
      const q = query.toLowerCase()
      const label = me.name ?? me.id
      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !me.id.toLowerCase().includes(q)
      ) {
        return []
      }
      return [{ id: me.id, label }]
    }),
  renderRow: (c) => (
    <div className="flex items-center gap-2">
      <span className="font-medium">{c.label}</span>
      {c.secondary && (
        <span className="text-muted-foreground text-xs">{c.secondary}</span>
      )}
    </div>
  ),
  renderChip: (ref) => (
    <span className="bg-accent text-accent-foreground rounded px-1 py-0.5 text-sm">
      @{ref.label}
    </span>
  )
}
