import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { CornerDownRight } from "lucide-react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useParentLabel } from "./EpicLabel"

export function SubTicketMarker({
  parentId,
  className
}: Readonly<{ parentId: TicketId; className?: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const label = useParentLabel({ orgSlug, slug, epicId: parentId })
  if (label === null || label.epic) return null
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id: parentId }}
      preload="intent"
      title={m.tickets_sub_ticket_of_marker({ id: parentId })}
      className={cn(
        "relative z-20 ml-2 inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <CornerDownRight className="size-3" strokeWidth={1.75} />
      {parentId}
    </Link>
  )
}
