import type { GroupId } from "@pp/shared"
import { useSearch, type LinkComponentProps } from "@tanstack/react-router"
import * as Predicate from "effect/Predicate"

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
) {
  if (sprint !== undefined) {
    return {
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId: sprint }
    } satisfies LinkComponentProps
  }
  if (Predicate.isTagged(from, "parent")) {
    return {
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: from.parent }
    } satisfies LinkComponentProps
  }
  return {
    to: "/orgs/$orgSlug/projects/$slug",
    params: { orgSlug, slug }
  } satisfies LinkComponentProps
}
