import { Bot, Plug, SlidersHorizontal, UserRound } from "lucide-react"

import { m } from "@/paraglide/messages"

export type ProfileSection = Readonly<{
  to:
    | "/profile/account"
    | "/profile/preferences"
    | "/profile/connections"
    | "/profile/agents"
  label: string
  icon: typeof UserRound
  description: string
}>

export const PROFILE_SECTIONS: ReadonlyArray<ProfileSection> = [
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
