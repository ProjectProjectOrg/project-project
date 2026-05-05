// Lightweight single-key global shortcut. Focuses the referenced input when
// `key` is pressed outside an editable target. Used for the `/` (search) and
// `c` (create ticket) affordances; small enough that each consumer wires its
// own listener rather than going through a central registry.

import { useEffect, type RefObject } from "react"

export function useGlobalShortcut(
  key: string,
  ref: RefObject<HTMLInputElement | null>,
  options: { selectOnFocus?: boolean } = {}
) {
  const { selectOnFocus = true } = options
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== key) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t && t.isContentEditable)
      ) {
        return
      }
      const el = ref.current
      if (!el) return
      e.preventDefault()
      el.focus()
      if (selectOnFocus) el.select?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [key, ref, selectOnFocus])
}
