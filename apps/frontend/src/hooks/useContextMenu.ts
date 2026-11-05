import { useEffect, useState, type RefObject } from "react"

export type MenuAnchor = Readonly<{ getBoundingClientRect: () => DOMRect }>

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !==
      null)

const pointAnchor = (x: number, y: number): MenuAnchor => ({
  getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 })
})

export type ContextRegion = (event: MouseEvent) => boolean

export function useContextMenu(
  target: RefObject<HTMLElement | null>,
  enabled = true,
  region?: ContextRegion
) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)

  useEffect(() => {
    const element = target.current
    if (element === null || !enabled) return undefined
    const listener: EventTarget = region ? document : element
    const onContextMenu = (event: Event) => {
      if (!(event instanceof MouseEvent)) return
      if (event.defaultPrevented || isTextEntry(event.target)) return
      if (region && !region(event)) return
      event.preventDefault()
      const fromKeyboard = event.clientX === 0 && event.clientY === 0
      setAnchor(
        fromKeyboard ? element : pointAnchor(event.clientX, event.clientY)
      )
      setOpen(true)
    }
    listener.addEventListener("contextmenu", onContextMenu)
    return () => listener.removeEventListener("contextmenu", onContextMenu)
  }, [target, enabled, region])

  return {
    open,
    anchor,
    onOpenChange: setOpen,
    clearAnchor: () => setAnchor(null)
  }
}
