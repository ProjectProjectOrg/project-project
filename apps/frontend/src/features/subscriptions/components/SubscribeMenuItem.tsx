import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { Bell, BellOff } from "lucide-react"
import { useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  setSubscribed,
  ticketSubscribers,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"
import { m } from "@/paraglide/messages"

export function SubscribeMenuItem({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const req = ticketSubscribersRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketSubscribers(req))
  if (!AsyncResult.isSuccess(result)) return null
  const { subscribed } = result.value
  const Icon = subscribed ? BellOff : Bell
  return (
    <DropdownMenuItem
      onClick={() =>
        void fireMutation(registry, setSubscribed(req), !subscribed)
      }
      className="cursor-pointer"
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {subscribed
        ? m.tickets_unsubscribe_button()
        : m.tickets_subscribe_button()}
    </DropdownMenuItem>
  )
}
