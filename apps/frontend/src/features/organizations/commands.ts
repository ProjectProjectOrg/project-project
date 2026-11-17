import { ArrowLeftRight, LayoutDashboard, Settings } from "@pp/ui/icons"

import type { Command } from "@/features/command-menu/lib/commands"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

export const organizationCommands: ReadonlyArray<Command> = [
  {
    id: "org.dashboard",
    hotkey: appHotkeys["nav.dashboard"],
    group: "navigation",
    label: m.chrome_command_menu_go_dashboard,
    icon: LayoutDashboard,
    keywords: ["home", "my tickets", "assigned", "mine"],
    run: ({ orgSlug }, env) => {
      env.navigate(`/orgs/${orgSlug}`)
      env.close()
    }
  },
  {
    id: "org.settings",
    hotkey: appHotkeys["nav.settings"],
    group: "navigation",
    label: m.chrome_command_menu_go_settings,
    icon: Settings,
    keywords: ["preferences"],
    run: ({ orgSlug, routeProjectSlug }, env) => {
      env.navigate(
        routeProjectSlug === null
          ? `/orgs/${orgSlug}/settings`
          : `/orgs/${orgSlug}/projects/${routeProjectSlug}/settings`
      )
      env.close()
    }
  },
  {
    id: "org.switch",
    hotkey: appHotkeys["nav.orgs"],
    group: "settings",
    label: m.chrome_command_menu_switch_org,
    icon: ArrowLeftRight,
    keywords: ["organization", "workspace"],
    page: "switchOrg"
  }
]
