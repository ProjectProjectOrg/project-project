import { Keyboard, Link, LogOut, Palette } from "lucide-react"

import { logout } from "@/features/auth/atoms/auth"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { shortcutSheetOpen } from "./atoms/commandMenu"
import type { Command } from "./lib/commands"

export const appCommands: ReadonlyArray<Command> = [
  {
    id: "app.copy-url",
    group: "miscellaneous",
    label: m.chrome_command_menu_copy_page_url,
    icon: Link,
    run: (_context, env) => {
      env.copy(window.location.href)
      env.close()
    }
  },
  {
    id: "app.shortcuts",
    group: "miscellaneous",
    label: m.chrome_keyboard_shortcuts,
    icon: Keyboard,
    keywords: ["hotkeys", "keys", "help"],
    hotkey: appHotkeys["app.shortcuts"],
    run: (_context, env) => {
      env.close()
      env.registry.set(shortcutSheetOpen, true)
    }
  },
  {
    id: "app.theme",
    group: "settings",
    label: m.chrome_command_menu_change_theme,
    icon: Palette,
    keywords: ["dark", "light", "appearance"],
    page: "theme"
  },
  {
    id: "app.logout",
    group: "account",
    label: m.chrome_command_menu_log_out,
    icon: LogOut,
    keywords: ["sign out"],
    run: (_context, env) => {
      env.close()
      env.execute(logout, undefined)
    }
  }
]
