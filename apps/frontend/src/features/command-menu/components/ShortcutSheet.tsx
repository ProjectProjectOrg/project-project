import { Command as CommandKeyIcon } from "@pp/ui/icons"
import { useAppHotkeyList } from "@tanstack/react-hotkeys"

import { m } from "@/paraglide/messages"

import type { CommandPageProps } from "../lib/commandPages"
import { shortcutGroups } from "../lib/shortcutGroups"
import { CommandFrame, type CommandFrameItem } from "./CommandFrame"

// "Keyboard shortcuts" in cmd+k: every app hotkey, grouped and searchable.
// Shortcuts that don't apply on this page are listed but disabled.
export function ShortcutSheetPage({ chip, onBack, env }: CommandPageProps) {
  const groups = shortcutGroups(useAppHotkeyList())
  const items = groups.flatMap(({ group, items: entries }) =>
    entries.flatMap(
      ({ appHotkey, status }): Array<CommandFrameItem> =>
        appHotkey.hotkey === null
          ? []
          : [
              {
                value: appHotkey.id,
                label: appHotkey.meta?.name ?? appHotkey.id,
                group,
                icon: CommandKeyIcon,
                shortcut: appHotkey.hotkey,
                disabled: status === "inactive"
              }
            ]
    )
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_keyboard_shortcuts()}
      onBack={onBack}
      items={items}
      onSelect={() => env.close()}
    />
  )
}
