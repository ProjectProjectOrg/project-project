import type { Ticket } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function ParentTicketLink({
  parent,
  variant = "chip",
  label
}: Readonly<{
  parent: Pick<Ticket, "id" | "title">
  variant?: "chip" | "inline"
  label?: ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const to = "/orgs/$orgSlug/projects/$slug/tickets/$id"
  const params = { orgSlug, slug, id: parent.id }
  const content = (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
        {parent.id}
      </span>
      <span className="max-w-[18ch] truncate text-foreground underline-offset-4 group-hover/parent:underline">
        {parent.title}
      </span>
    </span>
  )
  if (variant === "inline") {
    return (
      <Link
        to={to}
        params={params}
        preload="intent"
        className="group/parent -mx-2 inline-flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-body outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {label !== undefined && (
          <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
            {label}
          </span>
        )}
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
