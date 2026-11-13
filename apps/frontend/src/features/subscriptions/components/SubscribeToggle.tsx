import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketSubscribers, TicketId } from "@pp/shared"
import { Bell } from "lucide-react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  setSubscribed,
  ticketSubscribers,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"
import { useCanSubscribe } from "@/features/subscriptions/hooks/useCanSubscribe"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const subscribersText = ({ subscribers }: TicketSubscribers) =>
  subscribers.length === 0
    ? m.tickets_subscribers_none()
    : m.tickets_subscribers_list({
        names: new Intl.ListFormat(getLocale()).format(
          subscribers.map((user) => user.name || user.email)
        )
      })

export function SubscribeToggle({
  ticketId,
  className
}: Readonly<{ ticketId: TicketId; className?: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketSubscribersRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketSubscribers(req))
  const mutation = useAtomValue(setSubscribed(req))
  const subscribe = useAtomSet(setSubscribed(req))
  const refresh = useAtomRefresh(ticketSubscribers(req))
  const allowed = useCanSubscribe()

  if (!allowed) return null
  const error = mutationErrorText(mutation)

  return (
    <AsyncView
      result={result}
      onInitial={() => null}
      onFailure={(failure) => (
        <ReadFailure
          failure={failure}
          onRetry={refresh}
          className={className}
        />
      )}
      onSuccess={({ value: subscribers, waiting }) => (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="chip-toggle"
                size="compact"
                aria-pressed={subscribers.subscribed}
                onClick={() => subscribe(!subscribers.subscribed)}
                className={cn(waiting && "animate-pulse", className)}
              >
                <Bell className="size-3.5" strokeWidth={1.75} />
                {subscribers.subscribed
                  ? m.tickets_subscribed_button()
                  : m.tickets_subscribe_button()}
              </Button>
            }
          />
          <TooltipContent>
            {error ?? subscribersText(subscribers)}
          </TooltipContent>
        </Tooltip>
      )}
    />
  )
}
