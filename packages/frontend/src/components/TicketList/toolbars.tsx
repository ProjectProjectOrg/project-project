import type { Member, TicketListQuery } from "@projectproject/shared"
import type { ReactNode } from "react"
import { TicketToolbar, useServerTicketCounts } from "./toolbar"

type ToolbarVariantProps = {
  orgSlug: string
  slug: string
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  members: ReadonlyArray<Member>
}

export function BacklogToolbar({
  orgSlug,
  slug,
  query,
  onQueryChange,
  members,
  children
}: ToolbarVariantProps & { children?: ReactNode }) {
  const counts = useServerTicketCounts(orgSlug, slug, query)
  return (
    <TicketToolbar
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      onQueryChange={onQueryChange}
      members={members}
      counts={counts}
      filters={["archived", "type", "assignee", "sprint", "tags"]}
      showSort
    >
      {children}
    </TicketToolbar>
  )
}

export function SprintListToolbar({
  orgSlug,
  slug,
  query,
  onQueryChange,
  members
}: ToolbarVariantProps) {
  const counts = useServerTicketCounts(orgSlug, slug, query)
  return (
    <TicketToolbar
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      onQueryChange={onQueryChange}
      members={members}
      counts={counts}
      filters={["archived", "type", "assignee", "tags"]}
      showSort
    />
  )
}
