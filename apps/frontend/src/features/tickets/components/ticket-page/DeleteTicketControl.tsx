import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { useId, useRef, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  deleteTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

export function DeleteTicketControl({
  ticket
}: Readonly<{ ticket: Pick<TicketDetail, "id" | "type" | "subTicketCount"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const deleteState = useAtomValue(deleteTicket(req))
  const navigate = useNavigate()
  const trigger = useRef<HTMLButtonElement>(null)
  const [cascade, setCascade] = useState(false)
  const cascadeId = useId()
  const count = ticket.subTicketCount ?? 0

  return (
    <ConfirmButton.Root>
      <ConfirmButton.DeleteTrigger
        ref={trigger}
        persist
        aria-label={m.tickets_detail_delete_aria_label()}
      />
      <ConfirmButton.Popover anchor={trigger} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={m.tickets_detail_delete_confirm()}
          description={m.tickets_row_delete_description()}
          label={m.common_delete_confirm_button()}
          busyLabel={m.common_deleting_button()}
          waiting={deleteState.waiting}
          onConfirm={async () => {
            const exit = await remove({ cascadeSubTickets: cascade })
            if (Exit.isSuccess(exit))
              void navigate({
                to: "/orgs/$orgSlug/projects/$slug",
                params: { orgSlug, slug }
              })
            return exit
          }}
        >
          {count > 0 && (
            <label
              htmlFor={cascadeId}
              className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                id={cascadeId}
                checked={cascade}
                onCheckedChange={setCascade}
              />
              {ticket.type === "epic"
                ? m.tickets_detail_delete_cascade_tickets({ count })
                : m.tickets_detail_delete_cascade_sub_tickets({ count })}
            </label>
          )}
        </ConfirmButton.Action>
      </ConfirmButton.Popover>
    </ConfirmButton.Root>
  )
}
