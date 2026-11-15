import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { useId, useLayoutEffect, useRef, type ReactNode } from "react"

export function PopupHotkeyScope({
  open,
  children
}: Readonly<{ open: boolean; children: ReactNode }>) {
  const scope = useId()
  const marker = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const popup = marker.current?.closest<HTMLElement>('[role="dialog"]')
    const focused = document.activeElement
    if (!open && popup && focused !== popup && popup.contains(focused)) {
      popup.focus({ preventScroll: true })
    }
  }, [open])
  return (
    <HotkeysProvider scope={scope} exclusive enabled={open}>
      <span ref={marker} hidden />
      {children}
    </HotkeysProvider>
  )
}
