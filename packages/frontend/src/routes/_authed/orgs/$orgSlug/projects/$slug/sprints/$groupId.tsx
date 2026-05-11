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
  ): {
    ticket?: string
    focusBody?: number
    view?: "list" | "board"
  } => ({
    ticket: typeof search.ticket === "string" ? search.ticket : undefined,
    focusBody: search.focusBody === 1 ? 1 : undefined,
    view: search.view === "board" ? "board" : undefined
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
  const navigate = Route.useNavigate()
  const id = decodeGroupId(groupId)
  const currentView: "list" | "board" = view ?? "list"
  const setView = (next: "list" | "board") => {
    navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        view: next === "board" ? "board" : undefined
      })
    })
  }
  return (
    <SprintDetail
      orgSlug={orgSlug}
      slug={slug}
      groupId={id}
      view={currentView}
      onChangeView={setView}
    />
  )
}
