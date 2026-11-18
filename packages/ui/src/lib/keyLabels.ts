import type { KeyLabels } from "../components/command-menu"

// Key names for shortcut hints (Kbd), from the app's messages.
export type KeyMessages = Readonly<
  Record<
    | "common_key_ctrl"
    | "common_key_win"
    | "common_key_alt"
    | "common_key_shift"
    | "common_key_enter"
    | "common_key_escape"
    | "common_key_backspace"
    | "common_key_delete"
    | "common_key_tab"
    | "common_key_space",
    () => string
  >
>

export const keyLabelsFrom = (m: KeyMessages): KeyLabels => ({
  ctrl: m.common_key_ctrl(),
  meta: m.common_key_win(),
  alt: m.common_key_alt(),
  shift: m.common_key_shift(),
  enter: m.common_key_enter(),
  escape: m.common_key_escape(),
  backspace: m.common_key_backspace(),
  delete: m.common_key_delete(),
  tab: m.common_key_tab(),
  space: m.common_key_space()
})
