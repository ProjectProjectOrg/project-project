import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { useContext, useEffect, type FocusEvent } from "react"

import { pointedTicket } from "../atoms/commandMenu"
import type { TicketContext } from "../lib/commandMenu"

export function usePointedTicket(
  orgSlug: string,
  slug: string,
  ticketId: TicketId
) {
  const registry = useContext(RegistryContext)
  const isThis = (pointed: TicketContext | null) =>
    pointed !== null &&
    pointed.ticketId === ticketId &&
    pointed.slug === slug &&
    pointed.orgSlug === orgSlug
  const enter = () => {
    if (!isThis(registry.get(pointedTicket))) {
      registry.set(pointedTicket, { orgSlug, slug, ticketId })
    }
  }
  const leave = () => {
    if (isThis(registry.get(pointedTicket))) {
      registry.set(pointedTicket, null)
    }
  }
  useEffect(
    () => () => {
      const pointed = registry.get(pointedTicket)
      if (
        pointed !== null &&
        pointed.ticketId === ticketId &&
        pointed.slug === slug &&
        pointed.orgSlug === orgSlug
      ) {
        registry.set(pointedTicket, null)
      }
    },
    [registry, orgSlug, slug, ticketId]
  )
  return {
    onPointerEnter: enter,
    onPointerLeave: leave,
    onFocus: enter,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) leave()
    }
  }
}
