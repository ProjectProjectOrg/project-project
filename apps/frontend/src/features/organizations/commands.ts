import { ArrowLeftRight, LayoutDashboard, Settings } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

export const organizationCommands: ReadonlyArray<Command> = [
  {
    id: "org.dashboard",
    group: "navigation",
    label: m.chrome_command_menu_go_dashboard,
    icon: LayoutDashboard,
    keywords: ["home"],
    run: ({ orgSlug }, env) => {
      env.navigate(`/orgs/${orgSlug}`)
      env.close()
    }
  },
  {
    id: "org.settings",
    group: "navigation",
    label: m.chrome_command_menu_go_settings,
    icon: Settings,
    keywords: ["preferences"],
    run: ({ orgSlug }, env) => {
      env.navigate(`/orgs/${orgSlug}/settings`)
      env.close()
    }
  },
  {
    id: "org.switch",
    group: "settings",
    label: m.chrome_command_menu_switch_org,
    icon: ArrowLeftRight,
    keywords: ["organization", "workspace"],
    page: "switchOrg"
  }
]
