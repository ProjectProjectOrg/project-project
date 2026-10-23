import { createFileRoute } from "@tanstack/react-router"

import { OrgMembersSettings } from "@/features/members/components/OrgMembersSettings"
import { orgMembers, orgRequest } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/members")(
  {
    component: OrgMembersSettings,
    loader: ({ context: { registry }, params: { orgSlug } }) => {
      registry.mount(orgMembers(orgRequest(orgSlug)))()
      return {
        crumb: { type: "static" as const, label: m.org_settings_members_tab() }
      }
    }
  }
)
