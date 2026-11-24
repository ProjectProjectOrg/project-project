import { useAtomValue } from "@effect/atom-react"
import { Command as CommandKeyIcon } from "@pp/ui/icons"
import { useAppHotkeyList } from "@tanstack/react-hotkeys"

import { m } from "@/paraglide/messages"

import { commandScopes } from "../atoms/commandMenu"
import type { CommandPageProps } from "../lib/commandPages"
import { unavailableHotkeys } from "../lib/commands"
import { scopeCommands } from "../lib/commandScopes"
import { shortcutGroups } from "../lib/shortcutGroups"
import { commandRegistry } from "../registry"
import { CommandFrame, type CommandFrameItem } from "./CommandFrame"

// "Keyboard shortcuts" in cmd+k: every app hotkey, grouped and searchable.
// Shortcuts that don't apply on this page are listed but disabled: no
// handler is mounted or enabled, or none of its commands applies here.
// While this sheet is open its menu suspends every page hotkey, so a
// suspended one still counts as available.
export function ShortcutSheetPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const groups = shortcutGroups(useAppHotkeyList())
  const unavailable = unavailableHotkeys(
    [...scopeCommands(useAtomValue(commandScopes)), ...commandRegistry],
    context
  )
  const items = groups.flatMap(({ group, items: entries }) =>
    entries.flatMap<CommandFrameItem>(({ appHotkey, status }) =>
      appHotkey.hotkey === null
        ? []
        : [
            {
              value: appHotkey.id,
              label: appHotkey.meta?.name ?? appHotkey.id,
              group,
              icon: CommandKeyIcon,
              shortcut: appHotkey.hotkey,
              disabled:
                status === "inactive" ||
                status === "disabled" ||
                unavailable.has(appHotkey.id)
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
