import type { Ticket } from "@pp/shared"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function ParentTicketLink({
  parent
}: Readonly<{ parent: Pick<Ticket, "id" | "title"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Button
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: parent.id }}
          preload="intent"
        />
      }
      variant="chip"
      className="min-w-0"
    >
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {parent.id}
      </span>
      <span className="max-w-[18ch] truncate">{parent.title}</span>
    </Button>
  )
}
