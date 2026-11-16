import { Bot, Plug, SlidersHorizontal, UserRound } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export type ProfileSection = Readonly<{
  to:
    | "/profile/account"
    | "/profile/preferences"
    | "/profile/connections"
    | "/profile/agents"
  label: string
  icon: typeof UserRound
}>

export const PROFILE_SECTIONS: ReadonlyArray<ProfileSection> = [
  {
    to: "/profile/account",
    label: m.profile_section_account_title(),
    icon: UserRound
  },
  {
    to: "/profile/preferences",
    label: m.profile_section_preferences_title(),
    icon: SlidersHorizontal
  },
  {
    to: "/profile/connections",
    label: m.profile_section_connections_title(),
    icon: Plug
  },
  {
    to: "/profile/agents",
    label: m.profile_section_connected_agents_title(),
    icon: Bot
  }
]
