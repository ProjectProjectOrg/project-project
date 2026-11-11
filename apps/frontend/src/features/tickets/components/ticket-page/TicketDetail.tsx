import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { getRouteApi, Navigate } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect, useMemo, useRef } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { ticketRepo } from "@/features/github/lib/repos"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  movedTicket,
  ticketDetail,
  ticketRequest,
  type TicketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  TicketPage,
  TicketPageSkeleton
} from "@/features/tickets/components/ticket-page"
import { ticketSourceFromSearch } from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

function MovedTicketRedirect({ req }: Readonly<{ req: TicketRequest }>) {
  const result = useAtomValue(movedTicket(req))
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
      <Navigate
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{
          orgSlug: req.params.orgSlug,
          slug: value.projectSlug,
          id: value.id
        }}
        replace
      />
    )
  })
}

export function TicketDetail() {
  const { orgSlug, slug, id } = routeApi.useParams()
  const search = routeApi.useSearch()
  const from = useMemo(() => ticketSourceFromSearch(search), [search])
  const navigate = routeApi.useNavigate()
  const ticketId = decodeTicketId(id)
  const req = ticketRequest(orgSlug, slug, ticketId)
  const commandScope = useMemo(
    () => ({ ticket: { orgSlug, slug, ticketId } }),
    [orgSlug, slug, ticketId]
  )
  useCommandScope(commandScope)
  const result = useAtomValue(ticketDetail(req))
  const project = useProject()
  const autoFocusBody = useRef(search.focusBody === "1").current

  useEffect(() => {
    if (!autoFocusBody) return
    void navigate({
      to: ".",
      search: ({ focusBody: _focusBody, ...previous }) => previous,
      replace: true
    })
  }, [autoFocusBody, navigate])

  return Result.matchWithError(result, {
    onInitial: () => <TicketPageSkeleton />,
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => <MovedTicketRedirect req={req} />),
        Match.orElse((error) => <ErrorPage contained error={error} />)
      ),
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value }) => (
      <TicketPage
        key={value.id}
        ticket={value}
        members={project.members}
        github={ticketRepo(project, value.repoId)}
        autoFocusBody={autoFocusBody}
        splitInto={search.splitInto ?? []}
        from={from}
      />
    )
  })
}
