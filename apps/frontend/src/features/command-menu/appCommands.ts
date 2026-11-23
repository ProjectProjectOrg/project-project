import {
  Command as CommandKeyIcon,
  Link,
  LogOut,
  Megaphone,
  Palette
} from "@pp/ui/icons"

import { logout } from "@/features/auth/atoms/auth"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { Command } from "./lib/commands"

export const appCommands: ReadonlyArray<Command> = [
  Command.run({
    id: "app.copy-url",
    group: "miscellaneous",
    label: m.chrome_command_menu_copy_page_url,
    icon: Link,
    run: (_context, env) => {
      env.copy(window.location.href)
      env.close()
    }
  }),
  Command.run({
    id: "app.whats-new",
    group: "navigation",
    label: m.chrome_whats_new_title,
    icon: Megaphone,
    keywords: ["changelog", "release notes", "updates", "version"],
    run: (_context, env) => {
      env.navigate("/changelog")
      env.close()
    }
  }),
  Command.page({
    id: "app.shortcuts",
    group: "miscellaneous",
    label: m.chrome_keyboard_shortcuts,
    icon: CommandKeyIcon,
    keywords: ["hotkeys", "keys", "help"],
    hotkey: appHotkeys["app.shortcuts"],
    page: "shortcuts"
  }),
  Command.page({
    id: "app.theme",
    group: "settings",
    label: m.chrome_command_menu_change_theme,
    icon: Palette,
    keywords: ["dark", "light", "appearance"],
    page: "theme"
  }),
  Command.run({
    id: "app.logout",
    group: "account",
    label: m.chrome_command_menu_log_out,
    icon: LogOut,
    keywords: ["sign out"],
    run: (_context, env) => {
      env.close()
      env.execute(logout, undefined)
    }
  })
]
