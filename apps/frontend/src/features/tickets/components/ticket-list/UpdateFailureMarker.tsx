import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { CircleAlert } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import type { TicketUpdateAtom } from "@/features/tickets/atoms/ticketRows"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function UpdateFailureMarker({
  update
}: Readonly<{ update: TicketUpdateAtom }>) {
  const state = useAtomValue(update)
  const message = AsyncResult.matchWithError(state, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) => errorMessage(error),
    onDefect: () => m.tickets_row_update_error_fallback()
  })
  if (message === null) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${m.tickets_row_update_error_fallback()} ${message}`}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-destructive outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        }
      >
        <CircleAlert className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  )
}
