import { Link2 } from "lucide-react"

import { m } from "@/paraglide/messages"

export function LibrarySyncedLabel() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Link2 aria-hidden className="size-3.5" strokeWidth={1.75} />
      {m.templates_settings_synced()}
    </span>
  )
}
