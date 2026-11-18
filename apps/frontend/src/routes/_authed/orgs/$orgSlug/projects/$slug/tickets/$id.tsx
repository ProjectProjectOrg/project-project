import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  everhourProjectRequest,
  everhourProjectStatusAtom
} from "@/features/everhour/atoms/everhour"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { tagEditor, tagEditorRequest } from "@/features/tags/atoms/tags"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import {
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  ticketSequence,
  ticketSequenceRequest
} from "@/features/tickets/atoms/ticketSequence"
import { TicketDetail } from "@/features/tickets/components/ticket-page/TicketDetail"
import {
  sprintFromSearch,
  TicketDetailSearch,
  ticketSourceFromSearch
} from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetail,
  validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch),
  loaderDeps: ({ search }) => ({
    from: ticketSourceFromSearch(search),
    sprint: sprintFromSearch(search)
  }),
  loader: ({ context, params, deps, location }) => {
    const id = decodeTicketId(params.id)
    const ticket = {
      type: "ticket" as const,
      orgSlug: params.orgSlug,
      slug: params.slug,
      id
    }
    const crumb =
      deps.sprint === undefined
        ? ticket
        : [
            {
              type: "static" as const,
              label: m.project_detail_tab_sprints(),
              to: "/orgs/$orgSlug/projects/$slug/sprints",
              params: { orgSlug: params.orgSlug, slug: params.slug }
            },
            {
              type: "sprint" as const,
              orgSlug: params.orgSlug,
              slug: params.slug,
              groupId: deps.sprint
            },
            ticket
          ]
    if (location.state.ticketStep === true) return { crumb }
    context.registry.mount(
      ticketSequence(
        ticketSequenceRequest(
          params.orgSlug,
          params.slug,
          id,
          Predicate.isTagged(deps.from, "parent") ? undefined : deps.from
        )
      )
    )()
    if (deps.sprint !== undefined) {
      context.registry.mount(
        sprintDetail(sprintRequest(params.orgSlug, params.slug, deps.sprint))
      )()
    }
    context.registry.mount(
      ticketDetail(ticketRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      comments(commentsRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      ticketActivity(ticketActivityRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(orgStorage(storageRequest(params.orgSlug)))()
    context.registry.mount(orgDetail(orgRequest(params.orgSlug)))()
    context.registry.mount(
      projectLibraryFor(projectLibraryRequest(params.orgSlug, params.slug))
    )()
    context.registry.mount(
      projectEpics(epicsRequest(params.orgSlug, params.slug))
    )()
    context.registry.mount(
      tagEditor(tagEditorRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      everhourProjectStatusAtom(
        everhourProjectRequest(params.orgSlug, params.slug)
      )
    )()
    return { crumb }
  }
})
