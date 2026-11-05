import { getRouteApi, Outlet, useLocation } from "@tanstack/react-router"
import { useCallback } from "react"

import { RailBackLink } from "@/components/shell/RailBackLink"
import { SettingsPage } from "@/components/shell/settings/SettingsPage"
import {
  SettingsRail as Rail,
  SettingsRailLink,
  SettingsRailNav
} from "@/components/shell/settings/SettingsRail"
import { useSidebarSlot } from "@/components/shell/SidebarSlot"
import { ORG_SETTINGS_SECTIONS } from "@/features/organizations/lib/orgSettingsSections"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/settings")

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

export function OrgSettingsLayout() {
  const { orgSlug } = routeApi.useParams()
  const location = useLocation()
  const renderRail = useCallback(
    () => <OrgSettingsRail orgSlug={orgSlug} />,
    [orgSlug]
  )
  useSidebarSlot(`org-settings:${orgSlug}`, renderRail)

  const isActive = (page: Readonly<{ key: string }>) =>
    isSectionActive(location.pathname, orgSlug, page.key)
  const activeSection =
    SUB_PAGES.find(isActive) ??
    ORG_SETTINGS_SECTIONS.find(isActive) ??
    ORG_SETTINGS_SECTIONS[0]

  return (
    <SettingsPage
      heading={activeSection.heading}
      description={activeSection.description}
    >
      <Outlet />
    </SettingsPage>
  )
}

function OrgSettingsRail({ orgSlug }: { orgSlug: string }) {
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
        {ORG_SETTINGS_SECTIONS.filter(
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
