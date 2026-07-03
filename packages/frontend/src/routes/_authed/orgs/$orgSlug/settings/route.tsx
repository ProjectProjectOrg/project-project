import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback } from "react"
import { SlidersHorizontal, TriangleAlert, Users } from "lucide-react"
import { PageContainer, PageHeader } from "@/components/page"
import { RailBackLink } from "@/components/RailBackLink"
import { useSidebarSlot } from "@/components/SidebarSlot"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const SECTIONS = [
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
    key: "danger",
    to: "/orgs/$orgSlug/settings/danger",
    label: m.org_settings_danger_tab(),
    icon: TriangleAlert,
    heading: m.org_settings_danger_heading(),
    description: m.org_settings_danger_description()
  }
] satisfies ReadonlyArray<{
  key: string
  to:
    | "/orgs/$orgSlug/settings/general"
    | "/orgs/$orgSlug/settings/members"
    | "/orgs/$orgSlug/settings/danger"
  label: string
  icon: typeof SlidersHorizontal
  heading: string
  description: string
}>

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

  const activeSection =
    SECTIONS.find((section) =>
      isSectionActive(location.pathname, orgSlug, section.key)
    ) ?? SECTIONS[0]

  return (
    <PageContainer>
      <PageHeader>
        <h1>{activeSection.heading}</h1>
        <p>{activeSection.description}</p>
      </PageHeader>
      <Outlet />
    </PageContainer>
  )
}

function SettingsRail({ orgSlug }: { orgSlug: string }) {
  const location = useLocation()

  return (
    <div className="flex h-full flex-col gap-4">
      <RailBackLink
        to="/orgs/$orgSlug"
        params={{ orgSlug }}
        label={m.org_settings_crumb()}
      />
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          const active = isSectionActive(
            location.pathname,
            orgSlug,
            section.key
          )
          return (
            <Link
              key={section.key}
              to={section.to}
              params={{ orgSlug }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all duration-100 active:scale-[0.97]",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
