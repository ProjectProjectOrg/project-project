import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect, useMemo, useRef } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
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

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

const TicketDetailSearch = Schema.Struct({
  focusBody: Schema.optional(Schema.Literal(1)),
  splitInto: Schema.optional(Schema.Array(TicketId))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetailRoute,
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

function TicketDetailRoute() {
  const { orgSlug, slug, id } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const ticketId = decodeTicketId(id)
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticketId),
    [orgSlug, slug, ticketId]
  )
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
        orgSlug={orgSlug}
        slug={slug}
        ticket={value}
        members={project.members}
        github={project.github}
        autoFocusBody={autoFocusBody}
        splitInto={search.splitInto ?? []}
      />
    )
  })
}
