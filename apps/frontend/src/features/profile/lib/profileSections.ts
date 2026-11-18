import { Bot, Plug, SlidersHorizontal, UserRound } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export type ProfileSection = Readonly<{
  to:
    | "/settings/profile/account"
    | "/settings/profile/preferences"
    | "/settings/profile/connections"
    | "/settings/profile/agents"
  label: string
  icon: typeof UserRound
}>

export const PROFILE_SECTIONS: ReadonlyArray<ProfileSection> = [
  {
    to: "/settings/profile/account",
    label: m.profile_section_account_title(),
    icon: UserRound
  },
  {
    to: "/settings/profile/preferences",
    label: m.profile_section_preferences_title(),
    icon: SlidersHorizontal
  },
  {
    to: "/settings/profile/connections",
    label: m.profile_section_connections_title(),
    icon: Plug
  },
  {
    to: "/settings/profile/agents",
    label: m.profile_section_connected_agents_title(),
    icon: Bot
  }
]
