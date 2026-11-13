import type { User } from "@pp/shared"
import { useLocation, useParams } from "@tanstack/react-router"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"
import { useState } from "react"

import { Logo, Wordmark } from "@/components/shell/Logo"
import { PrimaryNav } from "@/components/shell/PrimaryNav"
import { SettingsSidebar } from "@/components/shell/settings/SettingsSidebar"
import { SidebarMenu } from "@/components/shell/SidebarMenu"
import { OrgSwitcher } from "@/features/organizations/components/OrgSwitcher"
import { transitions } from "@/lib/springs"

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
  const inSettings = SETTINGS_PATH.test(location.pathname)
  const [backHref, setBackHref] = useState<string | null>(null)
  if (!inSettings && backHref !== location.href) setBackHref(location.href)
  const reduceMotion = useReducedMotion()
  const scale = reduceMotion ? 1 : 0.98

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
        {orgSlug ? <OrgSwitcher /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={inSettings ? "settings" : "app"}
            initial={{ opacity: 0, scale }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale, pointerEvents: "none" }}
            transition={transitions.pop}
            className="absolute inset-0 overflow-y-auto"
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
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="p-3">
        <SidebarMenu user={user} orgSlug={orgSlug} />
      </div>
    </div>
  )
}
