import type { Ticket } from "@pp/shared"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function ParentTicketLink({
  parent,
  variant = "chip"
}: Readonly<{
  parent: Pick<Ticket, "id" | "title">
  variant?: "chip" | "inline"
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const to = "/orgs/$orgSlug/projects/$slug/tickets/$id"
  const params = { orgSlug, slug, id: parent.id }
  const content = (
    <>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {parent.id}
      </span>
      <span className="max-w-[18ch] truncate text-foreground underline-offset-4 group-hover/parent:underline">
        {parent.title}
      </span>
    </>
  )
  if (variant === "inline") {
    return (
      <Link
        to={to}
        params={params}
        preload="intent"
        className="group/parent inline-flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {content}
      </Link>
    )
  }
  return (
    <Button
      render={<Link to={to} params={params} preload="intent" />}
      variant="chip"
      className="min-w-0"
    >
      {content}
    </Button>
  )
}
