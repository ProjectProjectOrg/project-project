import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { Crumb } from "@/components/shell/crumb"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketSplit } from "@/features/tickets/components/ticket-split/TicketSplit"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

const TicketSplitSearch = Schema.Struct({
  from: Schema.optional(Schema.Literal("list"))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id_/split"
)({
  component: TicketSplit,
  validateSearch: Schema.toStandardSchemaV1(TicketSplitSearch),
  loader: ({ context, params }) => {
    const id = decodeTicketId(params.id)
    context.registry.mount(
      ticketDetail(ticketRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      comments(commentsRequest(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      sprintList(sprintListRequest(params.orgSlug, params.slug))
    )()
    return {
      crumb: Crumb.ticket({ orgSlug: params.orgSlug, slug: params.slug, id })
    }
  }
})
