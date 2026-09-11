import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { projectStatusesAtom } from "@/atoms/projectStatuses"
import {
  projectKey,
  sprintAtom,
  sprintKey,
  sprintsListAtom
} from "@/atoms/sprints"
import {
  ticketsSectionsAtom,
  ticketsSectionsKey,
  ticketsInSprintAtom,
  ticketsInSprintKey
} from "@/atoms/tickets"
import { GroupId, TicketListQuery } from "@projectproject/shared"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)

const SprintRouteSearchSchema = TicketListQuery.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board", "description"]))
  })
)
type SprintRouteSearch = typeof SprintRouteSearchSchema.Type

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
)({
  component: () => null,
  validateSearch: Schema.toStandardSchemaV1(SprintRouteSearchSchema),
  loaderDeps: ({ search }) => search,
  loader: ({
    context: { registry },
    params: { orgSlug, slug, groupId },
    deps: search
  }) => {
    const id = decodeGroupId(groupId)
    const key = projectKey(orgSlug, slug)
    const query = sprintListQuery(search, id)
    const view = search.view ?? "board"
    registry.mount(sprintAtom(sprintKey(orgSlug, slug, id)))()
    registry.mount(sprintsListAtom(key))()
    registry.mount(projectStatusesAtom(key))()
    if (view === "list") {
      registry.mount(
        ticketsSectionsAtom(ticketsSectionsKey(orgSlug, slug, query))
      )()
    } else if (view === "board") {
      registry.mount(
        ticketsInSprintAtom(ticketsInSprintKey(orgSlug, slug, id))
      )()
    }

    return {
      crumb: { type: "sprint" as const, orgSlug, slug, groupId: id }
    }
  }
})

function sprintListQuery(
  search: SprintRouteSearch,
  id: GroupId
): TicketListQuery {
  return { ...search, groupId: [id] }
}
