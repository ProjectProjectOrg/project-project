import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketPageSkeleton } from "@/features/tickets/components/ticket-page"
import { TicketSplitPage } from "@/features/tickets/components/ticket-split/TicketSplitPage"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id_/split"
)

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export function TicketSplit() {
  const { orgSlug, slug, id } = routeApi.useParams()
  const ticketId = decodeTicketId(id)
  const req = ticketRequest(orgSlug, slug, ticketId)
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
      <TicketSplitPage ticket={value} members={project.members} />
    )
  })
}
