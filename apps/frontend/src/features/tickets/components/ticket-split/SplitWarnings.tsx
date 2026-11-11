import type { TicketDetail } from "@pp/shared"
import { MessageSquare } from "lucide-react"
import type { ReactNode } from "react"

import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import { m } from "@/paraglide/messages"

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body leading-[18px]">
      <span className="mt-px shrink-0 text-state-warning">{icon}</span>
      <span>{children}</span>
    </p>
  )
}

export function SplitWarnings({
  ticket,
  commentCount,
  error
}: {
  ticket: TicketDetail
  commentCount: number
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {commentCount > 0 && (
        <Line icon={<MessageSquare className="size-3.5" strokeWidth={1.75} />}>
          <TicketIdText id={ticket.id}>
            {m.tickets_split_warning_comments({
              count: commentCount,
              id: ticket.id
            })}
          </TicketIdText>
        </Line>
      )}
      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  )
}
