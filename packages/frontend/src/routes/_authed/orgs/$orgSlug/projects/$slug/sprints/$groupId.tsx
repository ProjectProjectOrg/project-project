import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { SprintDetail } from "@/components/sprints/SprintDetail"
import {
  DEFAULT_TICKET_SORT,
  GroupId,
  ticketListQueryFromSearch,
  type TicketListQuery
} from "@projectproject/shared"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)

interface SprintRouteSearch extends Partial<TicketListQuery> {
  view?: "list" | "board"
}

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
)({
  component: SprintDetailRoute,
  validateSearch: (search: Record<string, unknown>): SprintRouteSearch => {
    const query = ticketListQueryFromSearch(search)
    const view = search.view === "board" ? "board" : "list"
    return { ...query, view }
  },
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
  const search = Route.useSearch()
  const id = decodeGroupId(groupId)
  const scopedQuery: TicketListQuery = {
    ...search,
    sort: search.sort ?? DEFAULT_TICKET_SORT,
    filter: {
      ...search.filter,
      groupId: [id]
    }
  }
  return (
    <SprintDetail
      orgSlug={orgSlug}
      slug={slug}
      groupId={id}
      view={search.view ?? "list"}
      listQuery={scopedQuery}
    />
  )
}
