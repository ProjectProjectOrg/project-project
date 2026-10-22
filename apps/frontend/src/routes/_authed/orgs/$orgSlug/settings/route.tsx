import { Outlet, useLocation } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"
import {
  LayoutTemplate,
  Plug,
  SlidersHorizontal,
  TriangleAlert,
  Users
} from "lucide-react"
import { useCallback } from "react"

import { RailBackLink } from "@/components/RailBackLink"
import { SettingsPage } from "@/components/settings/SettingsPage"
import {
  SettingsRail as Rail,
  SettingsRailLink,
  SettingsRailNav
} from "@/components/settings/SettingsRail"
import { useSidebarSlot } from "@/components/SidebarSlot"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

type OrgSettingsSection = Readonly<{
  key: string
  to:
    | "/orgs/$orgSlug/settings/general"
    | "/orgs/$orgSlug/settings/members"
    | "/orgs/$orgSlug/settings/integrations"
    | "/orgs/$orgSlug/settings/templates"
    | "/orgs/$orgSlug/settings/danger"
  label: string
  icon: typeof SlidersHorizontal
  heading: string
  description: string
}>

const SECTIONS: ReadonlyArray<OrgSettingsSection> = [
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
    key: "templates",
    to: "/orgs/$orgSlug/settings/templates",
    label: m.org_settings_templates_tab(),
    icon: LayoutTemplate,
    heading: m.org_settings_templates_heading(),
    description: m.org_settings_templates_description()
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

const SUB_PAGES: ReadonlyArray<
  Readonly<{ key: string; heading?: string; description?: string }>
> = [
  {
    key: "integrations/storage/files",
    heading: m.attachments_heading(),
    description: m.attachments_description()
  },
  { key: "integrations/github" },
  { key: "integrations/storage" },
  { key: "integrations/email" },
  { key: "integrations/everhour" },
  { key: "integrations/figma" }
]

const isSectionActive = (pathname: string, orgSlug: string, key: string) => {
  const base = `/orgs/${orgSlug}/settings/${key}`
  return pathname === base || pathname.startsWith(`${base}/`)
}

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings")({
  component: SettingsLayout,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_crumb() }
  })
})

function SettingsLayout() {
  const { orgSlug } = Route.useParams()
  const location = useLocation()
  const renderRail = useCallback(
    () => <SettingsRail orgSlug={orgSlug} />,
    [orgSlug]
  )
  useSidebarSlot(`org-settings:${orgSlug}`, renderRail)

  const isActive = (page: Readonly<{ key: string }>) =>
    isSectionActive(location.pathname, orgSlug, page.key)
  const activeSection =
    SUB_PAGES.find(isActive) ?? SECTIONS.find(isActive) ?? SECTIONS[0]

  return (
    <SettingsPage
      heading={activeSection.heading}
      description={activeSection.description}
    >
      <Outlet />
    </SettingsPage>
  )
}

function SettingsRail({ orgSlug }: { orgSlug: string }) {
  const actor = useOrgActor(orgSlug)
  const canSeeMembers = actor.call("org", "members")

  return (
    <Rail>
      <RailBackLink
        to="/orgs/$orgSlug"
        params={{ orgSlug }}
        label={m.org_settings_crumb()}
      />
      <SettingsRailNav>
        {SECTIONS.filter(
          (section) => section.key !== "members" || canSeeMembers
        ).map((section, index) => (
          <SettingsRailLink
            key={section.key}
            index={index}
            to={section.to}
            params={{ orgSlug }}
            icon={section.icon}
            label={section.label}
          />
        ))}
      </SettingsRailNav>
    </Rail>
  )
}
