import {
  Plug,
  Shapes,
  SlidersHorizontal,
  TriangleAlert,
  Users
} from "lucide-react"

import { m } from "@/paraglide/messages"

export type OrgSettingsSection = Readonly<{
  key: string
  to:
    | "/orgs/$orgSlug/settings/general"
    | "/orgs/$orgSlug/settings/members"
    | "/orgs/$orgSlug/settings/integrations"
    | "/orgs/$orgSlug/settings/types"
    | "/orgs/$orgSlug/settings/danger"
  label: string
  icon: typeof SlidersHorizontal
  heading: string
  description: string
}>

export const ORG_SETTINGS_SECTIONS: ReadonlyArray<OrgSettingsSection> = [
  {
    key: "general",
    to: "/orgs/$orgSlug/settings/general",
    label: m.org_settings_general_tab(),
    icon: SlidersHorizontal,
    heading: m.org_settings_general_heading(),
    description: m.org_settings_general_description()
  },
  {
    key: "members",
    to: "/orgs/$orgSlug/settings/members",
    label: m.org_settings_members_tab(),
    icon: Users,
    heading: m.org_settings_members_heading(),
    description: m.org_settings_members_description()
  },
  {
    key: "integrations",
    to: "/orgs/$orgSlug/settings/integrations",
    label: m.org_settings_integrations_tab(),
    icon: Plug,
    heading: m.org_settings_integrations_heading(),
    description: m.org_settings_integrations_description()
  },
  {
    key: "types",
    to: "/orgs/$orgSlug/settings/types",
    label: m.org_settings_types_tab(),
    icon: Shapes,
    heading: m.org_settings_types_heading(),
    description: m.org_settings_types_description()
  },
  {
    key: "danger",
    to: "/orgs/$orgSlug/settings/danger",
    label: m.org_settings_danger_tab(),
    icon: TriangleAlert,
    heading: m.org_settings_danger_heading(),
    description: m.org_settings_danger_description()
  }
]
