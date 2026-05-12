import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { useEffect, useRef } from "react"
import { TicketPage, TicketPageSkeleton } from "@/components/TicketPage"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { TicketId } from "@projectproject/shared"
import { ticketAtom, ticketKey } from "@/atoms/tickets"
import { m } from "@/paraglide/messages"
import { CircleDashed } from "lucide-react"
import { useProject } from "../-context"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

interface TicketDetailSearch {
  focusBody?: 1
}

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetailRoute,
  validateSearch: (search: Record<string, unknown>): TicketDetailSearch => {
    if (search.focusBody === 1) return { focusBody: 1 }
    return {}
  },
  loader: ({ params }) => ({
    crumb: {
      type: "ticket" as const,
      orgSlug: params.orgSlug,
      slug: params.slug,
      id: decodeTicketId(params.id)
    }
  })
})

function TicketDetailRoute() {
  const { orgSlug, slug, id } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const ticketId = decodeTicketId(id)
  const result = useAtomValue(ticketAtom(ticketKey(orgSlug, slug, ticketId)))
  const project = useProject()
  const autoFocusBody = useRef(search.focusBody === 1).current

  useEffect(() => {
    if (!autoFocusBody) return
    void navigate({
      to: ".",
      search: () => ({}),
      replace: true
    })
  }, [autoFocusBody, navigate])

  return Result.matchWithError(result, {
    onInitial: () => <TicketPageSkeleton />,
    onError: (error) => (
      <NotFound
        message={m.tickets_detail_load_error({ error: error._tag })}
      />
    ),
    onDefect: (defect) => (
      <NotFound
        message={m.tickets_detail_defect({ defect: String(defect) })}
      />
    ),
    onSuccess: ({ value }) => (
      <TicketPage
        orgSlug={orgSlug}
        slug={slug}
        ticket={value}
        members={project.members}
        github={project.github}
        autoFocusBody={autoFocusBody}
      />
    )
  })
}

function NotFound({ message }: { message: string }) {
  return (
    <Empty className="mx-auto w-full max-w-6xl border border-dashed border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleDashed strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {m.tickets_empty_title()}
        </EmptyTitle>
        <EmptyDescription className="max-w-md text-xs">
          {message}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
