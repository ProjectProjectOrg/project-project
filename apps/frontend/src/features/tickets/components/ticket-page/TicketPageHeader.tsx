import type { TicketDetail } from "@pp/shared"
import type { ReactNode } from "react"

import { TitleField } from "@/features/tickets/components/ticket-page/TitleField"

export function TicketPageHeader({
  ticket,
  readOnly = false,
  onTitleEnter = noop,
  meta
}: Readonly<{
  ticket: TicketDetail
  readOnly?: boolean
  onTitleEnter?: () => void
  meta?: ReactNode
}>) {
  return (
    <header className="flex min-w-0 flex-col items-start gap-1">
      <h1 className="w-full">
        {readOnly ? (
          <span className="block w-full px-2 py-1.5 text-display-compact font-semibold wrap-anywhere">
            {ticket.title}
          </span>
        ) : (
          <TitleField key={ticket.id} ticket={ticket} onEnter={onTitleEnter} />
        )}
      </h1>
      <div className="flex min-h-8 items-center gap-4 empty:hidden">{meta}</div>
    </header>
  )
}

const noop = () => {}
