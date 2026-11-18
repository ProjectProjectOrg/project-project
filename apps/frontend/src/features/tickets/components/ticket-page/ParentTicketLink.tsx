import type { Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Link } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function ParentTicketLink({
  parent
}: Readonly<{
  parent: Pick<Ticket, "id" | "title">
}>) {
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
      variant="ghost"
      tone="strong"
      className="min-w-0"
    >
      <span className="inline-flex min-w-0 items-baseline gap-1">
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {parent.id}
        </span>
        <span className="max-w-[18ch] truncate text-foreground underline-offset-4 group-hover/parent:underline">
          {parent.title}
        </span>
      </span>
    </Button>
  )
}
