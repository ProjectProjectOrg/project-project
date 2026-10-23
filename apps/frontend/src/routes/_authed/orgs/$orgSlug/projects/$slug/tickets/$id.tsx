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
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketDetail } from "@/features/tickets/components/ticket-page/TicketDetail"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

const TicketDetailSearch = Schema.Struct({
  focusBody: Schema.optional(Schema.Literal(1)),
  splitInto: Schema.optional(Schema.Array(TicketId))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetail,
  validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch),
  loader: ({ context, params }) => {
    const id = decodeTicketId(params.id)
    context.registry.mount(
      ticketDetail(ticketRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      comments(commentsRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(orgStorage(storageRequest(params.orgSlug)))()
    context.registry.mount(orgDetail(orgRequest(params.orgSlug)))()
    context.registry.mount(
      projectLibraryFor(projectLibraryRequest(params.orgSlug, params.slug))
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
