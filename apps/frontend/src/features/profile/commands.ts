import { Bot, CodeXml, Terminal } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

export const profileCommands: ReadonlyArray<Command> = [
  {
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
  },
  {
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
    searchOnly: true,
    run: (_context, env) => {
      env.navigate("/profile/agents")
      env.close()
    }
  },
  {
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
    searchOnly: true,
    run: (_context, env) => {
      env.navigate("/profile/agents")
      env.close()
    }
  }
]
