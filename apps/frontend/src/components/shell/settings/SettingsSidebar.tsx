import type { Project } from "@pp/shared"
import { useLocation, useRouter } from "@tanstack/react-router"
import { ChevronLeft, ChevronsUpDown } from "lucide-react"
import { useRef, useState } from "react"

import { ProjectMenuItems } from "@/components/shell/ProjectPicker"
import {
  SettingsRailLink,
  SettingsRailNav,
  useSettingsRailItem
} from "@/components/shell/settings/SettingsRail"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
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

const INDEX = { org: 0, project: 20, profile: 40 } as const

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
    <nav className="flex flex-col gap-3 px-3 py-2">
      <button
        type="button"
        onClick={() =>
          void (backHref
            ? router.navigate({ href: backHref })
            : router.navigate({ to: "/" }))
        }
        className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-body text-muted-foreground transition-[color,transform] duration-100 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        {m.chrome_sidebar_back_to_app()}
      </button>
      <SettingsRailNav>
        {orgSlug ? (
          <>
            <OrgGroup orgSlug={orgSlug} />
            <ProjectGroup orgSlug={orgSlug} projectSlug={projectSlug} />
          </>
        ) : null}
        <ProfileGroup />
      </SettingsRailNav>
    </nav>
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
    <>
      <ProjectGroupPicker
        orgSlug={orgSlug}
        project={project}
        projects={projects}
      />
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
    </>
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
  useSettingsRailItem(INDEX.project - 1, triggerRef)
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
    <div className="pt-4 pb-1">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          ref={triggerRef}
          aria-label={m.chrome_sidebar_project_switcher_aria_label()}
          className="relative z-10 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body text-foreground transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover"
        >
          <ProjectIconTile
            orgSlug={orgSlug}
            icon={project.icon}
            iconImage={project.iconImage}
            color={project.color}
            size="xs"
            seed={project.slug}
          />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
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
    </div>
  )
}

function OrgGroup({ orgSlug }: { orgSlug: string }) {
  const actor = useOrgActor(orgSlug)
  const sections = ORG_SETTINGS_SECTIONS.filter(
    (section) => section.key !== "members" || actor.call("org", "members")
  )
  return (
    <>
      <GroupHeader label={m.chrome_sidebar_settings_org_label()} />
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
    </>
  )
}

function ProfileGroup() {
  return (
    <>
      <GroupHeader label={m.profile_crumb_label()} />
      {PROFILE_SECTIONS.map((section, index) => (
        <SettingsRailLink
          key={section.to}
          index={INDEX.profile + index}
          to={section.to}
          icon={section.icon}
          label={section.label}
        />
      ))}
    </>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-1 text-caption font-semibold text-muted-foreground first:pt-0">
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}
