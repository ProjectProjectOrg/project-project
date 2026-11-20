import type { TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Split } from "@pp/ui/icons"
import { Link } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

export function SplitTicketControl({
  id,
  size = "icon-sm",
  className
}: {
  id: TicketId
  size?: "icon-xs" | "icon-sm"
  className?: string
}) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={m.tickets_split_action_aria_label()}
      title={m.tickets_split_action_aria_label()}
      className={className}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id/split"
          params={{ orgSlug, slug, id }}
          onClick={(e) => e.stopPropagation()}
        />
      }
    >
      <Split strokeWidth={1.75} />
    </Button>
  )
}
