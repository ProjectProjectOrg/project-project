import { useEffect, type RefObject } from "react"

export function useGlobalShortcut(
  key: string,
  ref: RefObject<HTMLInputElement | null>,
  options: { selectOnFocus?: boolean } = {}
) {
  const { selectOnFocus = true } = options
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = ref.current
      if (!el) return
      if (e.key === "Escape" && document.activeElement === el) {
        el.blur()
        return
      }
      if (e.key !== key) return
      const t = e.target
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      el.focus()
      if (selectOnFocus) el.select?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [key, ref, selectOnFocus])
}
