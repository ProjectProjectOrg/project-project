import { RegistryContext } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { isKeyboardNavigating } from "@pp/ui/lib/keyboard"
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent
} from "react"

import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import { commandMenuState, pointedTicket } from "../atoms/commandMenu"
import { pointedAt, type TicketContext } from "../lib/commandMenu"

export function usePointedTicket(
  orgSlug: string,
  slug: string,
  row: Ticket,
  patch: (edit: TicketEdit) => void
) {
  const registry = useContext(RegistryContext)
  const search = useContext(TicketViewSourceContext)
  const ticketId = row.id
  const self: TicketContext = { orgSlug, slug, ticketId }
  const latestPatch = useRef(patch)
  useLayoutEffect(() => {
    latestPatch.current = patch
  })
  const [stablePatch] = useState(
    () => (edit: TicketEdit) => latestPatch.current(edit)
  )
  const enter = () => {
    const pointed = pointedAt(registry.get(pointedTicket), self)
    if (pointed?.row !== row) {
      registry.set(pointedTicket, { ...self, row, patch: stablePatch, search })
    }
  }
  const leave = () => {
    if (pointedAt(registry.get(pointedTicket), self) !== null) {
      registry.set(pointedTicket, null)
    }
  }
  useEffect(() => {
    const at = { orgSlug, slug, ticketId: row.id }
    const pointed = pointedAt(registry.get(pointedTicket), at)
    if (pointed !== null && pointed.row !== row) {
      registry.set(pointedTicket, { ...pointed, row })
    }
    const menu = registry.get(commandMenuState)
    const opened = pointedAt(menu.row, at)
    if (opened !== null && opened.row !== row) {
      registry.set(commandMenuState, { ...menu, row: { ...opened, row } })
    }
  }, [registry, orgSlug, slug, row])
  useEffect(
    () => () => {
      if (
        pointedAt(registry.get(pointedTicket), { orgSlug, slug, ticketId }) !==
        null
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
