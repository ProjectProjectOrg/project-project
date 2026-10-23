import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useMemo } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketPageSkeleton } from "@/features/tickets/components/ticket-page"
import { TicketSplitPage } from "@/features/tickets/components/ticket-split/TicketSplitPage"
import { m } from "@/paraglide/messages"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id_/split"
)({
  component: TicketSplitRoute,
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

function TicketSplitRoute() {
  const { orgSlug, slug, id } = Route.useParams()
  const ticketId = decodeTicketId(id)
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticketId),
    [orgSlug, slug, ticketId]
  )
  const result = useAtomValue(ticketDetail(req))
  const project = useProject()

  return Result.matchWithError(result, {
    onInitial: () => <TicketPageSkeleton />,
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => (
          <NotFoundPage
            contained
            title={m.tickets_not_found_title()}
            body={m.tickets_not_found_body()}
          />
        )),
        Match.orElse((error) => <ErrorPage contained error={error} />)
      ),
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value }) => (
      <TicketSplitPage
        orgSlug={orgSlug}
        slug={slug}
        ticket={value}
        members={project.members}
      />
    )
  })
}
