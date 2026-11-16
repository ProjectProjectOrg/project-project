import type { Project } from "@pp/shared"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ChevronLeft, ChevronsUpDown } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { useLocation, useRouter } from "@tanstack/react-router"
import { useRef, useState, type ReactNode } from "react"

import { ProjectMenuItems } from "@/components/shell/ProjectPicker"
import {
  SettingsRailLink,
  SettingsRailNav,
  useSettingsRailItem
} from "@/components/shell/settings/SettingsRail"
import { ORG_SETTINGS_SECTIONS } from "@/features/organizations/lib/orgSettingsSections"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useScopedProject } from "@/features/projects/hooks/useScopedProject"
import {
  PROJECT_SETTINGS_SECTIONS,
  type SectionKey
} from "@/features/projects/lib/projectSettingsSections"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const INDEX = {
  projectPicker: 0,
  project: 1,
  org: 1 + PROJECT_SETTINGS_SECTIONS.length,
  profile: 1 + PROJECT_SETTINGS_SECTIONS.length + ORG_SETTINGS_SECTIONS.length
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
    <div className="flex flex-col gap-3 px-3 py-2">
      <button
        type="button"
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
        className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-body text-muted-foreground transition-colors duration-100 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        {m.chrome_sidebar_back_to_app()}
      </button>
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
  const { project, projects } = useScopedProject(orgSlug, projectSlug)
  if (!project) return null
  return (
    <SettingsGroup label={m.chrome_sidebar_project_section_label()}>
      {projects.length > 1 ? (
        <ProjectGroupPicker
          orgSlug={orgSlug}
          project={project}
          projects={projects}
        />
      ) : (
        <div className={projectRowClass}>
          <ProjectRowFace orgSlug={orgSlug} project={project} />
        </div>
      )}
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

function ProjectGroupPicker({
  orgSlug,
  project,
  projects
}: {
  orgSlug: string
  project: Project
  projects: ReadonlyArray<Project>
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useSettingsRailItem(INDEX.projectPicker, triggerRef)
  const settingsPrefix = `/orgs/${orgSlug}/projects/${project.slug}/settings/`
  const section = useLocation({
    select: ({ pathname }): SectionKey => {
      const segment = pathname.startsWith(settingsPrefix)
        ? pathname.slice(settingsPrefix.length).split("/")[0]
        : ""
      return (
        PROJECT_SETTINGS_SECTIONS.find((candidate) => candidate.key === segment)
          ?.key ?? "general"
      )
    }
  })
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={m.chrome_sidebar_project_switcher_aria_label()}
        className={cn(
          projectRowClass,
          "cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover"
        )}
      >
        <ProjectRowFace orgSlug={orgSlug} project={project} />
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-(--anchor-width) min-w-64"
      >
        <ProjectMenuItems
          orgSlug={orgSlug}
          currentSlug={project.slug}
          projects={projects}
          onPick={() => setOpen(false)}
          linkFor={(slug) => ({
            to: `/orgs/$orgSlug/projects/$slug/settings/${section}`,
            params: { orgSlug, slug }
          })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
      <ProjectIconTile
        orgSlug={orgSlug}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
        size="xs"
        seed={project.slug}
      />
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
