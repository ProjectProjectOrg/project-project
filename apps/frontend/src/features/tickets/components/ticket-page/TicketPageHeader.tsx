import type { TicketDetail, UpdateTicketInput } from "@pp/shared"
import type { ReactNode } from "react"

import { StatusButton } from "@/features/tickets/components/ticket-list/StatusField"
import { TitleField } from "@/features/tickets/components/ticket-page/TitleField"

export function TicketPageHeader({
  ticket,
  readOnly = false,
  onPatch,
  meta
}: {
  ticket: TicketDetail
  readOnly?: boolean
  onPatch?: (patch: UpdateTicketInput) => void
  meta?: ReactNode
}) {
  return (
    <header className="flex items-start gap-(--ticket-title-gap)">
      <div className="mt-1.5 flex h-[1lh] w-(--ticket-status-column) shrink-0 items-center justify-center text-display">
        <StatusButton
          ticket={ticket}
          size="lg"
          disabled={readOnly}
          onPatch={onPatch ?? noopPatch}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h1 className="w-full">
          {readOnly ? (
            <span className="block w-full px-2 py-1.5 text-display font-bold wrap-anywhere">
              {ticket.title}
            </span>
          ) : (
            <TitleField key={ticket.id} ticket={ticket} />
          )}
        </h1>
        <div className="flex min-h-8 items-center gap-3 px-2">
          <span className="text-body text-muted-foreground tabular-nums">
            {ticket.id}
          </span>
          {meta}
        </div>
      </div>
    </header>
  )
}

const noopPatch = (_patch: UpdateTicketInput) => {}
