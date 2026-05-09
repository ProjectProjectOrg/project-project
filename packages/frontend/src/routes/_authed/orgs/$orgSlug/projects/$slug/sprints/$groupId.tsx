import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { SprintDetail } from "@/components/sprints/SprintDetail"
import { GroupId } from "@projectproject/shared"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
)({
  component: SprintDetailRoute,
  validateSearch: (
    search: Record<string, unknown>
  ): { ticket?: string; focusBody?: number } => ({
    ticket: typeof search.ticket === "string" ? search.ticket : undefined,
    focusBody: search.focusBody === 1 ? 1 : undefined
  })
})

function SprintDetailRoute() {
  const { orgSlug, slug, groupId } = Route.useParams()
  const id = decodeGroupId(groupId)
  return <SprintDetail orgSlug={orgSlug} slug={slug} groupId={id} />
}
