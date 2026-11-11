import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
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
  ticketNeighbors,
  ticketNeighborsRequest
} from "@/features/tickets/atoms/ticketNeighbors"
import { TicketDetail } from "@/features/tickets/components/ticket-page/TicketDetail"
import {
  TicketDetailSearch,
  ticketSourceFromSearch
} from "@/features/tickets/lib/ticketSearch"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetail,
  validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch),
  loaderDeps: ({ search }) => ({ from: ticketSourceFromSearch(search) }),
  loader: ({ context, params, deps }) => {
    const id = decodeTicketId(params.id)
    if (deps.from !== undefined) {
      context.registry.mount(
        ticketNeighbors(
          ticketNeighborsRequest(params.orgSlug, params.slug, id, deps.from)
        )
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
    return {
      crumb: {
        type: "ticket" as const,
        orgSlug: params.orgSlug,
        slug: params.slug,
        id
      }
    }
  }
})
