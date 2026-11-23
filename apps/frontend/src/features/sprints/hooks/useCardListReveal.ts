import { useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

import {
  justCreatedTicket,
  type JustCreatedTicket
} from "@/features/tickets/atoms/createTicket"
import { isFresh } from "@/features/tickets/components/ticket-list/CreatedRow"

export function useRevealCreated(
  scrollRef: RefObject<HTMLDivElement | null>,
  virtualizer: Readonly<{
    measurementsCache: ReadonlyArray<Readonly<{ start: number; end: number }>>
    scrollToIndex: (index: number, options: { align: "center" }) => void
  }>,
  tickets: ReadonlyArray<Ticket>,
  slotIndexOf: (ticket: number) => number
) {
  const created = useAtomValue(justCreatedTicket)
  const createdIndex =
    created === null
      ? -1
      : tickets.findIndex((ticket) => ticket.id === created.id)
  const shownCreated = useRef<JustCreatedTicket | null>(null)
  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (
      created === null ||
      createdIndex < 0 ||
      !viewport ||
      created === shownCreated.current ||
      !isFresh(created.at)
    )
      return
    shownCreated.current = created
    viewport
      .closest("[data-board-column]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
    const item = virtualizer.measurementsCache[slotIndexOf(createdIndex)]
    const visible =
      item !== undefined &&
      item.start >= viewport.scrollTop &&
      item.end <= viewport.scrollTop + viewport.clientHeight
    if (!visible)
      virtualizer.scrollToIndex(slotIndexOf(createdIndex), { align: "center" })
  })
}

export function useRevealDraft(
  scrollRef: RefObject<HTMLDivElement | null>,
  virtualizer: Readonly<{
    scrollToIndex: (index: number, options: { align: "auto" }) => void
  }>,
  draftKey: string | undefined,
  draftIndex: number
) {
  const place = draftIndex >= 0 ? `${draftKey}:${draftIndex}` : null
  const shown = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (place === null || place === shown.current) return
    shown.current = place
    scrollRef.current
      ?.closest("[data-board-column]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
    virtualizer.scrollToIndex(draftIndex, { align: "auto" })
  })
}

export function useReportOverflow(
  contentHeight: number,
  viewportHeight: number,
  onOverflowChange: ((overflowing: boolean) => void) | undefined
) {
  const overflowing = viewportHeight > 0 && contentHeight > viewportHeight
  useEffect(() => {
    onOverflowChange?.(overflowing)
  }, [overflowing, onOverflowChange])
  return overflowing
}
