import type { KeyLabels } from "@pp/ui/command-menu"

import { m } from "@/paraglide/messages"

export const keyLabels = (): KeyLabels => ({
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
