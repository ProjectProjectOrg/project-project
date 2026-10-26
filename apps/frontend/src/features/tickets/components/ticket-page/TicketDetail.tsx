import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect, useRef } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  TicketPage,
  TicketPageSkeleton
} from "@/features/tickets/components/ticket-page"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export function TicketDetail() {
  const { orgSlug, slug, id } = routeApi.useParams()
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const ticketId = decodeTicketId(id)
  const req = ticketRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketDetail(req))
  const project = useProject()
  const autoFocusBody = useRef(search.focusBody === 1).current

  useEffect(() => {
    if (!autoFocusBody) return
    void navigate({
      to: ".",
      search: ({ splitInto }) =>
        splitInto && splitInto.length > 0 ? { splitInto } : {},
      replace: true
    })
  }, [autoFocusBody, navigate])

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
      <TicketPage
        ticket={value}
        members={project.members}
        github={project.github}
        autoFocusBody={autoFocusBody}
        splitInto={search.splitInto ?? []}
      />
    )
  })
}
