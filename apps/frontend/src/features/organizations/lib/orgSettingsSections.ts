import { Plug, Shapes, SlidersHorizontal, Users } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export type OrgSettingsSection = Readonly<{
  key: string
  to:
    | "/orgs/$orgSlug/settings/general"
    | "/orgs/$orgSlug/settings/members"
    | "/orgs/$orgSlug/settings/integrations"
    | "/orgs/$orgSlug/settings/types"
  label: string
  icon: typeof SlidersHorizontal
}>

export const ORG_SETTINGS_SECTIONS: ReadonlyArray<OrgSettingsSection> = [
  {
    key: "general",
    to: "/orgs/$orgSlug/settings/general",
    label: m.org_settings_general_tab(),
    icon: SlidersHorizontal
  },
  {
    key: "members",
    to: "/orgs/$orgSlug/settings/members",
    label: m.org_settings_members_tab(),
    icon: Users
  },
  {
    key: "integrations",
    to: "/orgs/$orgSlug/settings/integrations",
    label: m.org_settings_integrations_tab(),
    icon: Plug
  },
  {
    key: "types",
    to: "/orgs/$orgSlug/settings/types",
    label: m.org_settings_types_tab(),
    icon: Shapes
  }
]
