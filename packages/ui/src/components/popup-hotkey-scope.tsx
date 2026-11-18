import { HotkeysProvider } from "@tanstack/react-hotkeys"
import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

type ReportFocus = (child: string, focused: boolean) => void

const ReportFocus = createContext<ReportFocus | null>(null)

export function PopupHotkeyScope({
  open,
  children
}: Readonly<{ open: boolean; children: ReactNode }>) {
  const scope = useId()
  const marker = useRef<HTMLSpanElement>(null)
  const [ownFocus, setOwnFocus] = useState(false)
  const [focusedChildren, setFocusedChildren] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [reportChild] = useState(() => {
    const report: ReportFocus = (child, childFocused) =>
      setFocusedChildren((current) => {
        if (current.has(child) === childFocused) return current
        const next = new Set(current)
        if (childFocused) next.add(child)
        else next.delete(child)
        return next
      })
    return report
  })
  const focused = ownFocus || focusedChildren.size > 0
  const reportFocus = use(ReportFocus)
  useEffect(() => {
    const popup = marker.current?.closest<HTMLElement>('[role="dialog"]')
    if (!popup) return () => {}
    const onFocusIn = () => setOwnFocus(true)
    const onFocusOut = (event: FocusEvent) =>
      setOwnFocus(
        event.relatedTarget instanceof Node &&
          popup.contains(event.relatedTarget)
      )
    setOwnFocus(popup.contains(document.activeElement))
    popup.addEventListener("focusin", onFocusIn)
    popup.addEventListener("focusout", onFocusOut)
    return () => {
      popup.removeEventListener("focusin", onFocusIn)
      popup.removeEventListener("focusout", onFocusOut)
    }
  }, [])
  useEffect(() => {
    reportFocus?.(scope, focused)
    return () => reportFocus?.(scope, false)
  }, [reportFocus, scope, focused])
  useLayoutEffect(() => {
    const popup = marker.current?.closest<HTMLElement>('[role="dialog"]')
    const active = document.activeElement
    if (!open && popup && active !== popup && popup.contains(active)) {
      popup.focus({ preventScroll: true })
    }
  }, [open])
  return (
    <HotkeysProvider scope={scope} exclusive enabled={open && focused}>
      <ReportFocus value={reportChild}>
        <span ref={marker} hidden />
        {children}
      </ReportFocus>
    </HotkeysProvider>
  )
}
