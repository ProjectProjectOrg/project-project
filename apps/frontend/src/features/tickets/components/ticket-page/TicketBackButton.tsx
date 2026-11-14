import type { GroupId } from "@pp/shared"
import { useSearch, type LinkComponentProps } from "@tanstack/react-router"

import { BackButton } from "@/components/shell/BackButton"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { TicketPageSource } from "@/features/tickets/lib/ticketSearch"

export function TicketBackButton({
  from
}: Readonly<{ from: TicketPageSource | undefined }>) {
  const { orgSlug, slug } = useProjectRoute()
  const { sprint } = useSearch({ strict: false })
  return (
    <BackButton
      fallback={fallbackFor(from, sprint, orgSlug, slug)}
      className="-ml-2 shrink-0"
    />
  )
}

function fallbackFor(
  from: TicketPageSource | undefined,
  sprint: GroupId | undefined,
  orgSlug: string,
  slug: string
): LinkComponentProps {
  if (sprint !== undefined) {
    return {
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId: sprint }
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
