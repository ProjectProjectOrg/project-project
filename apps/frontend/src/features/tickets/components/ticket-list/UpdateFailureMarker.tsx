import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { CircleAlert } from "@pp/ui/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"

import type { TicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function UpdateFailureMarker({
  update
}: Readonly<{ update: TicketUpdateAtom }>) {
  const message = mutationErrorText(
    useAtomValue(update),
    errorMessage,
    m.tickets_row_update_error_fallback
  )
  if (message === null) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="block-grip"
            tone="error"
            aria-label={`${m.tickets_row_update_error_fallback()} ${message}`}
          />
        }
      >
        <CircleAlert className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  )
}
