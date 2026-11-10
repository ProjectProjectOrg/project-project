import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ImportPoints({ muted = false }: Readonly<{ muted?: boolean }>) {
  return (
    <ul
      className={cn(
        "flex flex-col gap-1 text-[13px]",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      <li>{m.jira_import_empty_point_tickets()}</li>
      <li>{m.jira_import_empty_point_people()}</li>
      <li>{m.jira_import_empty_point_review()}</li>
    </ul>
  )
}
