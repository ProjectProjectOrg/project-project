import { Link } from "@tanstack/react-router"
import { Split } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { TicketId } from "@projectproject/shared"

export function SplitTicketControl({
  orgSlug,
  slug,
  id,
  size = "icon-sm",
  className
}: {
  orgSlug: string
  slug: string
  id: TicketId
  size?: "icon-xs" | "icon-sm"
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={m.tickets_split_action_aria_label()}
      title={m.tickets_split_action_aria_label()}
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
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
