import { GroupId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { backlog, backlogRequest } from "@/features/tickets/atoms/backlog"
import {
  SprintSearch,
  ticketQueryFromSearch
} from "@/features/tickets/lib/ticketSearch"
import { readViewPreference } from "@/hooks/useViewPreference"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
)({
  component: () => null,
  validateSearch: Schema.toStandardSchemaV1(SprintSearch),
  loaderDeps: ({ search }) => search,
  loader: ({
    context: { registry },
    params: { orgSlug, slug, groupId },
    deps: search
  }) => {
    const id = decodeGroupId(groupId)
    const query = { ...ticketQueryFromSearch(search), groupId: [id] }
    const view = search.view ?? readViewPreference(orgSlug, slug, "sprints")
    registry.mount(sprintDetail(sprintRequest(orgSlug, slug, id)))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    if (view === "list") {
      registry.mount(backlog(backlogRequest(orgSlug, slug, query)))()
    } else if (view === "board") {
      registry.mount(sprintBoard(boardRequest(orgSlug, slug, id)))()
    }

    return {
      crumb: { type: "sprint" as const, orgSlug, slug, groupId: id }
    }
  }
})
