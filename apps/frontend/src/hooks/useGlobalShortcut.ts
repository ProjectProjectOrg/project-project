import { useHotkey, type HotkeyChord } from "@tanstack/react-hotkeys"
import type { RefObject } from "react"

export function useGlobalShortcut(
  key: HotkeyChord,
  ref: RefObject<HTMLInputElement | null>
) {
  useHotkey(key, () => {
    ref.current?.focus()
    ref.current?.select()
  })
  useHotkey("Escape", () => ref.current?.blur(), { target: ref })
}
