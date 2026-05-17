import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { SprintDetail } from "@/components/sprints/SprintDetail"
import { GroupId } from "@projectproject/shared"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
)({
  component: SprintDetailRoute,
  validateSearch: (
    search: Record<string, unknown>
  ): {
    view?: "list" | "board"
  } => ({
    view: search.view === "list" ? "list" : undefined
  }),
  loader: ({ params }) => ({
    crumb: {
      type: "sprint" as const,
      orgSlug: params.orgSlug,
      slug: params.slug,
      groupId: decodeGroupId(params.groupId)
    }
  })
})

function SprintDetailRoute() {
  const { orgSlug, slug, groupId } = Route.useParams()
  const { view } = Route.useSearch()
  const id = decodeGroupId(groupId)
  const currentView: "list" | "board" = view ?? "board"
  return (
    <SprintDetail
      orgSlug={orgSlug}
      slug={slug}
      groupId={id}
      view={currentView}
    />
  )
}
