import { RegistryContext } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import {
  useContext,
  useEffect,
  type FocusEvent,
  type PointerEvent
} from "react"

import { isKeyboardNavigating } from "@/lib/keyboard"

import { pointedTicket } from "../atoms/commandMenu"
import type { PointedTicket } from "../lib/commandMenu"

export function usePointedTicket(orgSlug: string, slug: string, row: Ticket) {
  const registry = useContext(RegistryContext)
  const ticketId = row.id
  const isThis = (pointed: PointedTicket | null) =>
    pointed !== null &&
    pointed.ticketId === ticketId &&
    pointed.slug === slug &&
    pointed.orgSlug === orgSlug
  const enter = () => {
    const pointed = registry.get(pointedTicket)
    if (!isThis(pointed) || pointed?.row !== row) {
      registry.set(pointedTicket, { orgSlug, slug, ticketId, row })
    }
  }
  const leave = () => {
    if (isThis(registry.get(pointedTicket))) {
      registry.set(pointedTicket, null)
    }
  }
  useEffect(() => {
    const pointed = registry.get(pointedTicket)
    if (
      pointed !== null &&
      pointed.row !== row &&
      pointed.ticketId === row.id &&
      pointed.slug === slug &&
      pointed.orgSlug === orgSlug
    ) {
      registry.set(pointedTicket, { ...pointed, row })
    }
  }, [registry, orgSlug, slug, row])
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
