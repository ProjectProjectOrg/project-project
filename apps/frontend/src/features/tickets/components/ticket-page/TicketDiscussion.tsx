import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, Ticket, TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { CommentsSection } from "@/features/comments/components/CommentsSection"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  quickCreateSubTicket,
  subTickets,
  subTicketsRequest,
  subTicketUpdates
} from "@/features/tickets/atoms/epics"
import {
  Row,
  rowGridClassName
} from "@/features/tickets/components/ticket-list/Row"
import { TicketComposer } from "@/features/tickets/components/ticket-list/TicketComposer"
import { useTicketPreview } from "@/features/tickets/components/ticket-list/useTicketPreview"
import { NON_EPIC_TYPES } from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

type Props = Readonly<{ ticket: Ticket; members: ReadonlyArray<Member> }>

export function TicketDiscussion({ ticket, members }: Props) {
  return ticket.type === "epic" ? (
    <EpicDiscussion epicId={ticket.id} members={members} />
  ) : (
    <CommentsSection ticketId={ticket.id} />
  )
}

function EpicDiscussion({
  epicId,
  members
}: Readonly<{ epicId: TicketId; members: ReadonlyArray<Member> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = subTicketsRequest(orgSlug, slug, epicId)
  const result = useAtomValue(subTickets(req))
  const create = useAtomSet(quickCreateSubTicket(req), { mode: "promiseExit" })
  const createState = useAtomValue(quickCreateSubTicket(req))
  const preview = useTicketPreview()
  const count = Result.isSuccess(result) ? result.value.length : 0

  const content = (
    <>
      <div className="mb-3">
        <TicketComposer
          types={NON_EPIC_TYPES}
          parent={epicId}
          create={create}
          createState={createState}
        />
      </div>
      {Result.matchWithError(result, {
        onInitial: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <div className={rowGridClassName}>
            {value.map((row) => (
              <Row
                key={row.key}
                update={subTicketUpdates(req)}
                ticket={row.ticket}
                members={members}
                showParent={false}
                pending={row.pending}
                previewOpen={preview.activePreviewId === row.ticket.id}
                onPreviewPointerEnter={preview.onPreviewPointerEnter}
                onPreviewOpenChange={preview.onPreviewOpenChange}
              />
            ))}
          </div>
        )
      })}
    </>
  )

  return (
    <CommentsSection
      ticketId={epicId}
      leadingTab={{
        label: m.tickets_sub_tickets_heading(),
        badge: count > 0 ? count : null,
        content
      }}
    />
  )
}
