import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react"

import { forwardThroughMenuBackdrop, isMenuBackdrop } from "@/lib/menuBackdrop"

export type Anchor = Readonly<{ getBoundingClientRect: () => DOMRect }>

type Handoff = Readonly<{ closeInstantly: () => void }>

type OpenMenu = { current: Handoff | null }

const openMenu: OpenMenu = { current: null }

const pointAnchor = (x: number, y: number): Anchor => ({
  getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 })
})

const opensMenu = (target: EventTarget, trigger: Element): boolean =>
  target instanceof Element &&
  trigger.contains(target) &&
  target.closest("input, textarea, select, [contenteditable='true']") === null

const isSecondaryPress = (event: Event): boolean =>
  event instanceof globalThis.MouseEvent && event.button === 2

type OpenChangeDetails = Readonly<{
  reason: string
  event: Event
  cancel: () => void
}>

export function useTicketContextMenu() {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)
  const [instant, setInstant] = useState(false)
  const [self] = useState<Handoff>(() => ({
    closeInstantly: () => {
      setInstant(true)
      setOpen(false)
    }
  }))

  useEffect(() => {
    if (!open) return undefined
    openMenu.current = self
    const onContextMenu = (event: globalThis.MouseEvent) => {
      if (!isMenuBackdrop(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (forwardThroughMenuBackdrop(event)) return
      setInstant(false)
      setOpen(false)
    }
    document.addEventListener("contextmenu", onContextMenu, true)
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true)
      if (openMenu.current === self) openMenu.current = null
    }
  }, [open, self])

  const showAt = (nextAnchor: Anchor) => {
    const switching = openMenu.current !== null && openMenu.current !== self
    if (switching) openMenu.current?.closeInstantly()
    if (!open) setInstant(switching)
    setAnchor(nextAnchor)
    setOpen(true)
  }

  return {
    anchor,
    open,
    instant,
    openAt: (event: MouseEvent<HTMLElement>) => {
      if (!opensMenu(event.target, event.currentTarget)) return
      event.preventDefault()
      showAt(pointAnchor(event.clientX, event.clientY))
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return
      if (!opensMenu(event.target, event.currentTarget)) return
      event.preventDefault()
      event.stopPropagation()
      showAt(event.currentTarget)
    },
    onOpenChange: (next: boolean, details: OpenChangeDetails) => {
      if (
        !next &&
        details.reason === "outside-press" &&
        isSecondaryPress(details.event)
      ) {
        details.cancel()
        return
      }
      setInstant(false)
      setOpen(next)
    },
    suppressNativeMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
    }
  }
}
