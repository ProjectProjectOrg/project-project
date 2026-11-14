import { useHotkey, type AppHotkey } from "@tanstack/react-hotkeys"
import type { RefObject } from "react"

export function useGlobalShortcut(
  hotkey: AppHotkey,
  ref: RefObject<HTMLInputElement | null>
) {
  useHotkey(hotkey, () => {
    ref.current?.focus()
    ref.current?.select()
  })
  useHotkey("Escape", () => ref.current?.blur(), {
    target: ref,
    stopPropagation: false
  })
}
