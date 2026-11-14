import {
  formatForDisplay,
  parseHotkey,
  type Hotkey,
  type HotkeyPlatform
} from "@tanstack/react-hotkeys"

import { m } from "@/paraglide/messages"

const WORD_LABELS: ReadonlyMap<string, () => string> = new Map([
  ["Control", m.common_key_ctrl],
  ["Alt", m.common_key_alt],
  ["Shift", m.common_key_shift],
  ["Meta", m.common_key_win],
  ["Enter", m.common_key_enter],
  ["Tab", m.common_key_tab],
  ["Backspace", m.common_key_backspace],
  ["Delete", m.common_key_delete],
  ["Escape", m.common_key_escape],
  ["Space", m.common_key_space]
])

const MAC_WORDS: ReadonlySet<string> = new Set(["Escape", "Space"])

export type KeyCap = Readonly<{
  key: string
  label: string
  sequenceStart: boolean
}>

export function hotkeyCaps(
  hotkey: Hotkey,
  platform: HotkeyPlatform
): ReadonlyArray<KeyCap> {
  const steps = [hotkey].flat()
  return steps.flatMap((chord, step) => {
    const parsed = parseHotkey(chord, platform)
    const labels = formatForDisplay(chord, { platform, parts: true })
    const names =
      parsed.key === undefined
        ? parsed.modifiers
        : [...parsed.modifiers, parsed.key]
    return names.map((name, index) => {
      const word =
        platform !== "mac" || MAC_WORDS.has(name)
          ? WORD_LABELS.get(name)
          : undefined
      return {
        key: name.toLowerCase(),
        label: word?.() ?? labels[index] ?? name,
        sequenceStart: steps.length > 1 && step === 0
      }
    })
  })
}
