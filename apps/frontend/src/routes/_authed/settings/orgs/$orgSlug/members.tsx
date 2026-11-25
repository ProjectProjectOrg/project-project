import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { OrgMembersSettings } from "@/features/members/components/OrgMembersSettings"
import { orgMembers, orgRequest } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/orgs/$orgSlug/members")(
  {
    component: OrgMembersSettings,
    loader: ({ context: { registry }, params: { orgSlug } }) => {
      registry.mount(orgMembers(orgRequest(orgSlug)))()
      return settingsPage(
        m.org_settings_members_tab(),
        m.org_settings_members_description()
      )
    }
  }
)
