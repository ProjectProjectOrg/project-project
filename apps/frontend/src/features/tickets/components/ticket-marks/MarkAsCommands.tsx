import { Flag, FlagOff } from "lucide-react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { openFlagDialog } from "@/features/tickets/atoms/flagTicketDialog"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

const FLAG = "flag"

export function MarkAsCommands({
  chip,
  onBack,
  env,
  context
}: CommandPageProps) {
  const flagged = context.ticketDetail?.flag != null
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_mark_as_placeholder()}
      onBack={onBack}
      items={[
        flagged
          ? { value: FLAG, label: m.tickets_mark_remove_flag(), icon: FlagOff }
          : { value: FLAG, label: m.tickets_mark_flagged(), icon: Flag },
        ...MARK_KINDS.map(({ kind, icon, label }) => ({
          value: kind,
          label: label(),
          icon
        }))
      ]}
      onSelect={(item) => {
        const { ticket, ticketDetail } = context
        if (item.value === FLAG) {
          if (ticket === null) return
          if (!flagged) {
            return openFlagDialog(env, ticket, ticketDetail?.title ?? "")
          }
          env.execute(
            updateTicketDetail(
              ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
            ),
            { flag: null }
          )
          return env.close()
        }
        const mark = MARK_KINDS.find(({ kind }) => kind === item.value)
        if (mark !== undefined) env.open(`mark:${mark.kind}`)
      }}
    />
  )
}
