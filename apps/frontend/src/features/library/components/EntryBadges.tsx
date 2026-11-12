import { Badge } from "@/components/ui/badge"
import { m } from "@/paraglide/messages"

export function ChangedHereBadge({ project }: Readonly<{ project?: string }>) {
  return (
    <Badge size="xs" tone="amber" data-changed-here>
      {project === undefined
        ? m.templates_types_changed_here()
        : m.templates_types_changed_in({ project })}
    </Badge>
  )
}

export function SameOnEveryTicketBadge() {
  return <Badge size="xs">{m.templates_sections_same_badge()}</Badge>
}

export function OffHereBadge() {
  return <Badge size="xs">{m.templates_types_off_badge()}</Badge>
}
