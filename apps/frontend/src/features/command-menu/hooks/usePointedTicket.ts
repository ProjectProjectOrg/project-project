import { RegistryContext } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import {
  useContext,
  useEffect,
  type FocusEvent,
  type PointerEvent
} from "react"

import { isKeyboardNavigating } from "@/lib/keyboard"

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
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (!isKeyboardNavigating(event.currentTarget)) enter()
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (!isKeyboardNavigating(event.currentTarget)) leave()
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.movementX !== 0 || event.movementY !== 0) enter()
    },
    onFocus: enter,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (
        !event.currentTarget.contains(event.relatedTarget) &&
        (!event.currentTarget.matches(":hover") ||
          isKeyboardNavigating(event.currentTarget))
      )
        leave()
    }
  }
}
