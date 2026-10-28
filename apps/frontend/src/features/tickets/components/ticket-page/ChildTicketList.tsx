import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, Ticket } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketUpdates,
  childTickets,
  childTicketsRequest,
  quickCreateChildTicket
} from "@/features/tickets/atoms/childTickets"
import {
  Row,
  rowGridClassName
} from "@/features/tickets/components/ticket-list/Row"
import { TicketComposer } from "@/features/tickets/components/ticket-list/TicketComposer"
import { useTicketPreview } from "@/features/tickets/components/ticket-list/useTicketPreview"
import { NON_EPIC_TYPES } from "@/features/tickets/lib/ticketMeta"

import { AttachTicketPicker } from "./AttachTicketPicker"

type Parent = Pick<Ticket, "id" | "type">

export function ChildTicketList({
  parent,
  members,
  editable
}: Readonly<{
  parent: Parent
  members: ReadonlyArray<Member>
  editable: boolean
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = childTicketsRequest(orgSlug, slug, parent.id)
  const result = useAtomValue(childTickets(req))
  const create = useAtomSet(quickCreateChildTicket(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateChildTicket(req))
  const preview = useTicketPreview()

  return (
    <div className="flex flex-col gap-3 py-0.5">
      {editable && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TicketComposer
              types={NON_EPIC_TYPES}
              parent={parent.id}
              create={create}
              createState={createState}
            />
          </div>
          <AttachTicketPicker parent={parent} />
        </div>
      )}
      {Result.matchWithError(result, {
        onInitial: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <div className={rowGridClassName}>
            {value.map((row) => (
              <Row
                key={row.key}
                update={childTicketUpdates(req)}
                ticket={row.ticket}
                members={members}
                showParent={false}
                pending={row.pending}
                editable={editable}
                previewOpen={preview.activePreviewId === row.ticket.id}
                onPreviewPointerEnter={preview.onPreviewPointerEnter}
                onPreviewOpenChange={preview.onPreviewOpenChange}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
