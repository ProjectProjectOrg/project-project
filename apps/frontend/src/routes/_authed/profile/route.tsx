import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router"
import { Bot, Plug, SlidersHorizontal, UserRound } from "lucide-react"
import { useCallback } from "react"

import { RailBackLink } from "@/components/RailBackLink"
import { SettingsPage } from "@/components/settings/SettingsPage"
import {
  SettingsRail as Rail,
  SettingsRailLink,
  SettingsRailNav
} from "@/components/settings/SettingsRail"
import { useSidebarSlot } from "@/components/SidebarSlot"
import { m } from "@/paraglide/messages"

type ProfileSection = Readonly<{
  to:
    | "/profile/account"
    | "/profile/preferences"
    | "/profile/connections"
    | "/profile/agents"
  label: string
  icon: typeof UserRound
  description: string
}>

const SECTIONS: ReadonlyArray<ProfileSection> = [
  {
    to: "/profile/account",
    label: m.profile_section_account_title(),
    icon: UserRound,
    description: m.profile_section_account_description()
  },
  {
    to: "/profile/preferences",
    label: m.profile_section_preferences_title(),
    icon: SlidersHorizontal,
    description: m.profile_section_preferences_description()
  },
  {
    to: "/profile/connections",
    label: m.profile_section_connections_title(),
    icon: Plug,
    description: m.profile_section_connections_description()
  },
  {
    to: "/profile/agents",
    label: m.profile_section_connected_agents_title(),
    icon: Bot,
    description: m.profile_section_connected_agents_description()
  }
]

export const Route = createFileRoute("/_authed/profile")({
  component: ProfileLayout,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_crumb_label(),
      to: "/profile"
    }
  })
})

function ProfileLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const renderRail = useCallback(() => <ProfileRail />, [])
  useSidebarSlot("profile-settings", renderRail)

  const active =
    SECTIONS.find(
      (section) =>
        pathname === section.to || pathname.startsWith(`${section.to}/`)
    ) ?? SECTIONS[0]

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
        {SECTIONS.map((section, index) => (
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
