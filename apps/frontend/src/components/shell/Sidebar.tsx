import type { User } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { Logo, Wordmark } from "@pp/ui/logo"
import { useLocation, useMatches, useParams } from "@tanstack/react-router"
import { LayoutGroup } from "motion/react"
import { useState } from "react"

import { PrimaryNav } from "@/components/shell/PrimaryNav"
import { SettingsSidebar } from "@/components/shell/settings/SettingsSidebar"
import { SidebarMenu } from "@/components/shell/SidebarMenu"
import { OrgSwitcher } from "@/features/organizations/components/OrgSwitcher"

export function Sidebar({ user }: { user: User }) {
  return (
    <aside className="row-span-2 hidden lg:flex">
      <LayoutGroup id="sidebar-desktop">
        <SidebarContent user={user} />
      </LayoutGroup>
    </aside>
  )
}

const SETTINGS_PATH =
  /^\/(?:profile|orgs\/[^/]+\/settings|orgs\/[^/]+\/projects\/[^/]+\/settings)(?:\/|$)/

export function SidebarContent({ user }: { user: User }) {
  const { orgSlug: routeOrgSlug, slug } = useParams({ strict: false })
  const orgSlug = routeOrgSlug ?? user.activeOrgSlug
  const location = useLocation()
  const inSettings = useMatches({
    select: (matches) => SETTINGS_PATH.test(matches.at(-1)?.pathname ?? "")
  })
  const [backHref, setBackHref] = useState<string | null>(null)
  if (!SETTINGS_PATH.test(location.pathname) && backHref !== location.href)
    setBackHref(location.href)
  const [pane, setPane] = useState({ inSettings, switched: false })
  if (pane.inSettings !== inSettings) setPane({ inSettings, switched: true })

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
        {orgSlug ? <OrgSwitcher /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          key={inSettings ? "settings" : "app"}
          className={cn(
            "absolute inset-0 overflow-y-auto",
            pane.switched &&
              (inSettings
                ? "pp-pane-in [--pp-pane-from:12px]"
                : "pp-pane-in [--pp-pane-from:-12px]")
          )}
        >
          {inSettings ? (
            <SettingsSidebar
              orgSlug={orgSlug}
              projectSlug={slug ?? null}
              backHref={backHref}
            />
          ) : (
            <PrimaryNav orgSlug={orgSlug} />
          )}
        </div>
      </div>
      <div className="p-3">
        <SidebarMenu user={user} orgSlug={orgSlug} />
      </div>
    </div>
  )
}
