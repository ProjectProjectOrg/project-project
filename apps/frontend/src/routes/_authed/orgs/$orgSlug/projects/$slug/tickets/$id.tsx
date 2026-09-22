import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useEffect, useMemo, useRef } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { TicketPage, TicketPageSkeleton } from "@/components/TicketPage"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

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
