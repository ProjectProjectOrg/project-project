import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { getRouteApi, Navigate } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect, useMemo, useRef, type ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { ticketRepo } from "@/features/github/lib/repos"
import { useMarkTicketRead } from "@/features/inbox/hooks/useMarkTicketRead"
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
import { TicketBackButton } from "@/features/tickets/components/ticket-page/TicketBackButton"
import { TicketPageLoading } from "@/features/tickets/components/ticket-page/TicketPageLoading"
import { TicketStepper } from "@/features/tickets/components/ticket-page/TicketStepper"
import { useRememberViewedTicket } from "@/features/tickets/hooks/useReturnToTicket"
import { useTicketStepping } from "@/features/tickets/hooks/useTicketStepping"
import {
  ticketSourceFromSearch,
  type TicketPageSource
} from "@/features/tickets/lib/ticketSearch"
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
  const urlId = decodeTicketId(id)
  const stepping = useTicketStepping(urlId, from)
  const { shown, sequence } = stepping
  const commandScope = useMemo(
    () => ({ ticket: { orgSlug, slug, ticketId: shown } }),
    [orgSlug, slug, shown]
  )
  useCommandScope(commandScope)
  useRememberViewedTicket(shown, from?.kind === "parent" ? undefined : from)
  useMarkTicketRead(
    urlId,
    Result.isSuccess(
      useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, urlId)))
    )
  )
  const autoFocusBody = useRef(search.focusBody === "1").current

  useEffect(() => {
    if (!autoFocusBody) return
    void navigate({
      to: ".",
      search: ({ focusBody: _focusBody, ...previous }) => previous,
      replace: true
    })
  }, [autoFocusBody, navigate])

  const back = <TicketBackButton from={from} />
  const stepper = sequence !== null && (
    <TicketStepper sequence={sequence} shown={shown} search={stepping.search} />
  )
  const title =
    sequence?.tickets.find((ticket) => ticket.id === shown)?.title ?? null
  const loading = (
    <TicketPageLoading back={back} stepper={stepper} title={title} />
  )
  const atUrl = shown === urlId
  return (
    <LoadedTicket
      req={ticketRequest(orgSlug, slug, shown)}
      loading={loading}
      stepper={stepper}
      from={from}
      autoFocusBody={atUrl && autoFocusBody}
      splitInto={atUrl ? (search.splitInto ?? []) : []}
    />
  )
}

function LoadedTicket({
  req,
  loading,
  stepper,
  from,
  autoFocusBody,
  splitInto
}: Readonly<{
  req: TicketRequest
  loading: ReactNode
  stepper: ReactNode
  from: TicketPageSource | undefined
  autoFocusBody: boolean
  splitInto: ReadonlyArray<TicketId>
}>) {
  const result = useAtomValue(ticketDetail(req))
  const project = useProject()
  return Result.matchWithError(result, {
    onInitial: () => loading,
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
        splitInto={splitInto}
        from={from}
        stepper={stepper}
      />
    )
  })
}
