import { Bot, CodeXml, Terminal } from "@pp/ui/icons"

import { Command } from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

export const profileCommands: ReadonlyArray<Command> = [
  Command.page({
    id: "profile.editor",
    group: "settings",
    label: m.profile_command_editor,
    parent: m.chrome_command_menu_settings_group_profile,
    icon: CodeXml,
    keywords: [
      "preferences",
      "default editor",
      "vscode",
      "vs code",
      "cursor",
      "github.dev",
      "open branch"
    ],
    page: "editorPreference"
  }),
  Command.run({
    id: "profile.cli",
    group: "navigation",
    label: m.profile_command_cli,
    parent: m.chrome_command_menu_settings_group_profile,
    icon: Terminal,
    keywords: [
      "pp",
      "terminal",
      "command line",
      "install",
      "usage",
      "login",
      "setup"
    ],
    listed: "search",
    run: (_context, env) => {
      env.navigate("/profile/agents")
      env.close()
    }
  }),
  Command.run({
    id: "profile.mcp",
    group: "navigation",
    label: m.profile_command_mcp,
    parent: m.chrome_command_menu_settings_group_profile,
    icon: Bot,
    keywords: [
      "agents",
      "claude",
      "codex",
      "cursor",
      "gemini",
      "usage",
      "setup",
      "connect",
      "model context protocol"
    ],
    listed: "search",
    run: (_context, env) => {
      env.navigate("/profile/agents")
      env.close()
    }
  })
]
