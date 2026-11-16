import type { Project } from "@pp/shared"
import { SidebarBack } from "@pp/ui/sidebar"
import { useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"

import {
  SettingsRailLink,
  SettingsRailNav
} from "@/components/shell/settings/SettingsRail"
import { ORG_SETTINGS_SECTIONS } from "@/features/organizations/lib/orgSettingsSections"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useScopedProject } from "@/features/projects/hooks/useScopedProject"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const INDEX = {
  project: 0,
  org: PROJECT_SETTINGS_SECTIONS.length,
  profile: PROJECT_SETTINGS_SECTIONS.length + ORG_SETTINGS_SECTIONS.length
} as const

const projectRowClass =
  "relative z-10 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body text-foreground"

export function SettingsSidebar({
  orgSlug,
  projectSlug,
  backHref
}: Readonly<{
  orgSlug: string | null
  projectSlug: string | null
  backHref: string | null
}>) {
  const router = useRouter()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2">
      <SidebarBack
        label={m.chrome_sidebar_back_to_app()}
        className="mx-0"
        onClick={() =>
          void router.navigate({
            href:
              backHref ??
              (orgSlug && projectSlug
                ? `/orgs/${orgSlug}/projects/${projectSlug}`
                : orgSlug
                  ? `/orgs/${orgSlug}`
                  : "/")
          })
        }
      />
      <SettingsRailNav>
        {orgSlug ? (
          <>
            <ProjectGroup orgSlug={orgSlug} projectSlug={projectSlug} />
            <OrgGroup orgSlug={orgSlug} />
          </>
        ) : null}
        <ProfileGroup />
      </SettingsRailNav>
    </div>
  )
}

function ProjectGroup({
  orgSlug,
  projectSlug
}: {
  orgSlug: string
  projectSlug: string | null
}) {
  const { project } = useScopedProject(orgSlug, projectSlug)
  if (!project) return null
  return (
    <SettingsGroup label={m.chrome_sidebar_project_section_label()}>
      <div className={projectRowClass}>
        <ProjectRowFace orgSlug={orgSlug} project={project} />
      </div>
      {PROJECT_SETTINGS_SECTIONS.map((section, index) => (
        <SettingsRailLink
          key={section.key}
          index={INDEX.project + index}
          to={`/orgs/$orgSlug/projects/$slug/settings/${section.key}`}
          params={{ orgSlug, slug: project.slug }}
          icon={section.icon}
          label={section.label}
        />
      ))}
    </SettingsGroup>
  )
}

function ProjectRowFace({
  orgSlug,
  project
}: {
  orgSlug: string
  project: Project
}) {
  return (
    <>
      {/* A 14px tile in the icons' 16px slot: the line icons below draw
          about 1px in from their box, so a full 16px tile looks too big and
          sits left of them. */}
      <span className="grid size-4 shrink-0 place-items-center">
        <ProjectIconTile
          orgSlug={orgSlug}
          icon={project.icon}
          iconImage={project.iconImage}
          color={project.color}
          size="row"
          seed={project.slug}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
    </>
  )
}

function OrgGroup({ orgSlug }: { orgSlug: string }) {
  const actor = useOrgActor(orgSlug)
  const sections = ORG_SETTINGS_SECTIONS.filter(
    (section) => section.key !== "members" || actor.call("org", "members")
  )
  return (
    <SettingsGroup label={m.chrome_sidebar_settings_org_label()}>
      {sections.map((section, index) => (
        <SettingsRailLink
          key={section.key}
          index={INDEX.org + index}
          to={section.to}
          params={{ orgSlug }}
          icon={section.icon}
          label={section.label}
        />
      ))}
    </SettingsGroup>
  )
}

function ProfileGroup() {
  return (
    <SettingsGroup label={m.profile_crumb_label()}>
      {PROFILE_SECTIONS.map((section, index) => (
        <SettingsRailLink
          key={section.to}
          index={INDEX.profile + index}
          to={section.to}
          icon={section.icon}
          label={section.label}
        />
      ))}
    </SettingsGroup>
  )
}

function SettingsGroup({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <div className="truncate px-3 pb-1 text-caption font-semibold text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}
