import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { TicketPageSkeleton } from "@/components/TicketPage"
import { TicketSplitPage } from "@/components/TicketSplit/TicketSplitPage"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

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
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.tickets_not_found_title()}
          body={m.tickets_not_found_body()}
        />
      ) : (
        <ErrorPage contained error={error} />
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
