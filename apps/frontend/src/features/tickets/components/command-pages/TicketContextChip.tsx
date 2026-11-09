import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { CommandMenuShortcut } from "@/components/ui/command-menu"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

export function TicketContextChip({
  ticket
}: Readonly<{ ticket: TicketContext }>) {
  const detail = useAtomValue(
    ticketDetail(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId))
  )
  const title = Result.isSuccess(detail) ? detail.value.title : null
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[7px] bg-hover pl-2 text-[13px]">
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.ticketId}
        </span>
        {title !== null && (
          <span className="min-w-0 truncate font-medium text-foreground">
            {title}
          </span>
        )}
      </span>
      <CommandMenuShortcut
        keys="backspace"
        className="ml-0 self-stretch *:h-full *:rounded-none *:px-1.5"
      />
    </span>
  )
}
