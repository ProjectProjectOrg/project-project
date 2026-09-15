import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { TicketPageSkeleton } from "@/components/TicketPage"
import { TicketSplitPage } from "@/components/TicketSplit/TicketSplitPage"
import { TicketId } from "@projectproject/shared"
import { commentsAtom, commentsKey } from "@/atoms/comments"
import { ticketAtom, ticketKey } from "@/atoms/tickets"
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
      ticketAtom(ticketKey(params.orgSlug, params.slug, id))
    )()
    context.registry.mount(
      commentsAtom(commentsKey(params.orgSlug, params.slug, id))
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
  const result = useAtomValue(ticketAtom(ticketKey(orgSlug, slug, ticketId)))
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
