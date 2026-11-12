import { RegistryContext } from "@effect/atom-react"
import type { TicketId, TicketViewSource } from "@pp/shared"
import { use, useEffect, useLayoutEffect, useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { lastViewedTicket } from "@/features/tickets/atoms/lastViewedTicket"

export function useRememberViewedTicket(
  ticketId: TicketId,
  from: TicketViewSource | undefined
): void {
  const registry = use(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  useEffect(() => {
    if (from !== undefined)
      registry.set(lastViewedTicket, { orgSlug, slug, ticketId })
  }, [registry, orgSlug, slug, ticketId, from])
}

export function useReturnToTicket(
  focus: (ticketId: TicketId) => boolean
): () => void {
  const registry = use(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  const latestFocus = useRef(focus)
  useLayoutEffect(() => {
    latestFocus.current = focus
  })
  const pending = useRef<TicketId | null>(null)
  const [attempt] = useState(() => () => {
    const ticketId = pending.current
    if (ticketId === null || !latestFocus.current(ticketId)) return
    pending.current = null
    registry.set(lastViewedTicket, null)
  })

  useLayoutEffect(() => {
    const last = registry.get(lastViewedTicket)
    pending.current =
      last !== null && last.orgSlug === orgSlug && last.slug === slug
        ? last.ticketId
        : null
    attempt()
    const cancel = () => {
      pending.current = null
      registry.set(lastViewedTicket, null)
    }
    window.addEventListener("pointerdown", cancel, true)
    window.addEventListener("keydown", cancel, true)
    return () => {
      window.removeEventListener("pointerdown", cancel, true)
      window.removeEventListener("keydown", cancel, true)
    }
  }, [registry, orgSlug, slug, attempt])

  return attempt
}
