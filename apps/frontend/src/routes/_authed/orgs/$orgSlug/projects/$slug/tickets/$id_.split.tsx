import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

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

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id_/split"
)({
  component: TicketSplit,
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
      crumb: {
        type: "ticket" as const,
        orgSlug: params.orgSlug,
        slug: params.slug,
        id
      }
    }
  }
})
