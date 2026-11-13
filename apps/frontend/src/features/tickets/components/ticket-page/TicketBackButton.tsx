import type { LinkComponentProps } from "@tanstack/react-router"

import { BackButton } from "@/components/shell/BackButton"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { TicketPageSource } from "@/features/tickets/lib/ticketSearch"

export function TicketBackButton({
  from
}: Readonly<{ from: TicketPageSource | undefined }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <BackButton
      fallback={fallbackFor(from, orgSlug, slug)}
      className="-ml-2 shrink-0"
    />
  )
}

function fallbackFor(
  from: TicketPageSource | undefined,
  orgSlug: string,
  slug: string
): LinkComponentProps {
  if (from?.kind === "sprintBoard") {
    return {
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId: from.groupId }
    }
  }
  if (from?.kind === "parent") {
    return {
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: from.parent }
    }
  }
  return { to: "/orgs/$orgSlug/projects/$slug", params: { orgSlug, slug } }
}
