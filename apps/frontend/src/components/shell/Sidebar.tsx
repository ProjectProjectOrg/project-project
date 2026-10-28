import type { User } from "@pp/shared"
import { useParams } from "@tanstack/react-router"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"

import { Logo, Wordmark } from "@/components/shell/Logo"
import { PrimaryNav } from "@/components/shell/PrimaryNav"
import {
  useSidebarSectionContent,
  useSidebarSlotContent
} from "@/components/shell/SidebarSlot"
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher"
import { FeedbackPopover } from "@/features/feedback/components/FeedbackPopover"
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

export function SidebarContent({ user }: { user: User }) {
  const { orgSlug: routeOrgSlug } = useParams({ strict: false })
  const orgSlug = routeOrgSlug ?? user.activeOrgSlug
  const slot = useSidebarSlotContent()
  const section = useSidebarSectionContent()
  const reduceMotion = useReducedMotion()
  const railScale = reduceMotion ? 1 : 1.02
  const navScale = reduceMotion ? 1 : 0.98

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
        {orgSlug ? <OrgSwitcher /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          {slot ? (
            <motion.div
              key="rail"
              initial={{ opacity: 0, scale: railScale }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: railScale, pointerEvents: "none" }}
              transition={transitions.pop}
              className="absolute inset-0 overflow-y-auto px-3 py-2 will-change-transform"
            >
              {slot}
            </motion.div>
          ) : (
            <motion.div
              key="nav"
              initial={{ opacity: 0, scale: navScale }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: navScale, pointerEvents: "none" }}
              transition={transitions.pop}
              className="absolute inset-0 overflow-y-auto will-change-transform"
            >
              <PrimaryNav orgSlug={orgSlug} />
              <AnimatePresence initial={false}>
                {section ? (
                  <motion.div
                    key="section"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={transitions.presence}
                  >
                    {section}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <ThemeSwitcher />
        {orgSlug ? <FeedbackPopover orgSlug={orgSlug} /> : null}
      </div>
    </div>
  )
}
