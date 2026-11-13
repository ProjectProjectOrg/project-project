import { useAtomValue } from "@effect/atom-react"
import type { Member, Ticket } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  bulkUpdateChildTickets,
  childTicketUpdates,
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  Row,
  rowGridClassName
} from "@/features/tickets/components/ticket-list/Row"
import {
  SelectionOrder,
  TicketSelectionProvider
} from "@/features/tickets/components/ticket-list/TicketSelection"
import { useTicketPreview } from "@/features/tickets/components/ticket-list/useTicketPreview"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"

type Parent = Pick<Ticket, "id" | "title" | "type">

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
  const preview = useTicketPreview()

  return (
    <div className="flex flex-col gap-1">
      {Result.matchWithError(result, {
        onInitial: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <TicketSelectionProvider resetKey={parent.id}>
            <SelectionOrder
              entries={value.flatMap(({ ticket, pending }) =>
                pending
                  ? []
                  : [
                      {
                        key: selectionKey(slug, ticket.id),
                        ticket,
                        bulk: bulkUpdateChildTickets(req)
                      }
                    ]
              )}
            >
              <TicketViewSourceContext
                value={{ from: "parent", parentId: parent.id }}
              >
                <div className={rowGridClassName}>
                  {value.map((row) => (
                    <Row
                      key={row.key}
                      update={childTicketUpdates(req)}
                      ticket={row.ticket}
                      members={members}
                      contextParent={parent.id}
                      pending={row.pending}
                      editable={editable}
                      previewOpen={preview.activePreviewId === row.ticket.id}
                      onPreviewPointerEnter={preview.onPreviewPointerEnter}
                      onPreviewOpenChange={preview.onPreviewOpenChange}
                    />
                  ))}
                </div>
              </TicketViewSourceContext>
            </SelectionOrder>
          </TicketSelectionProvider>
        )
      })}
    </div>
  )
}
