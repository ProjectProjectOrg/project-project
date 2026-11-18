import { Plug, Shapes, SlidersHorizontal, Users } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export type OrgSettingsSection = Readonly<{
  key: string
  to:
    | "/settings/orgs/$orgSlug/general"
    | "/settings/orgs/$orgSlug/members"
    | "/settings/orgs/$orgSlug/integrations"
    | "/settings/orgs/$orgSlug/types"
  label: string
  icon: typeof SlidersHorizontal
}>

export const ORG_SETTINGS_SECTIONS: ReadonlyArray<OrgSettingsSection> = [
  {
    key: "general",
    to: "/settings/orgs/$orgSlug/general",
    label: m.org_settings_general_tab(),
    icon: SlidersHorizontal
  },
  {
    key: "members",
    to: "/settings/orgs/$orgSlug/members",
    label: m.org_settings_members_tab(),
    icon: Users
  },
  {
    key: "integrations",
    to: "/settings/orgs/$orgSlug/integrations",
    label: m.org_settings_integrations_tab(),
    icon: Plug
  },
  {
    key: "types",
    to: "/settings/orgs/$orgSlug/types",
    label: m.org_settings_types_tab(),
    icon: Shapes
  }
]
