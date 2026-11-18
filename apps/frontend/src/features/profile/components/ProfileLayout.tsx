import { Outlet, useLocation } from "@tanstack/react-router"
import { useCallback } from "react"

import { RailBackLink } from "@/components/shell/RailBackLink"
import { SettingsPage } from "@/components/shell/settings/SettingsPage"
import {
  SettingsRail as Rail,
  SettingsRailLink,
  SettingsRailNav
} from "@/components/shell/settings/SettingsRail"
import { useSidebarSlot } from "@/components/shell/SidebarSlot"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"
import { m } from "@/paraglide/messages"

export function ProfileLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const renderRail = useCallback(() => <ProfileRail />, [])
  useSidebarSlot("profile-settings", renderRail)

  const active =
    PROFILE_SECTIONS.find(
      (section) =>
        pathname === section.to || pathname.startsWith(`${section.to}/`)
    ) ?? PROFILE_SECTIONS[0]

  return (
    <SettingsPage heading={active.label} description={active.description}>
      <Outlet />
    </SettingsPage>
  )
}

function ProfileRail() {
  return (
    <Rail>
      <RailBackLink to="/" label={m.profile_crumb_label()} />
      <SettingsRailNav>
        {PROFILE_SECTIONS.map((section, index) => (
          <SettingsRailLink
            key={section.to}
            index={index}
            to={section.to}
            icon={section.icon}
            label={section.label}
          />
        ))}
      </SettingsRailNav>
    </Rail>
  )
}
