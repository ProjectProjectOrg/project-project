import { useAtomValue } from "@effect/atom-react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import {
  GitBranch,
  LayoutTemplate,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  Workflow
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback } from "react"

import { RailBackLink } from "@/components/shell/RailBackLink"
import { SettingsPage } from "@/components/shell/settings/SettingsPage"
import {
  SettingsRail as Rail,
  SettingsRailLink,
  SettingsRailNav
} from "@/components/shell/settings/SettingsRail"
import { useSidebarSlot } from "@/components/shell/SidebarSlot"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

type SectionKey =
  | "general"
  | "team"
  | "workflow"
  | "templates"
  | "integrations"
  | "danger"

type ProjectSettingsSection = Readonly<{
  key: SectionKey
  label: string
  icon: typeof SlidersHorizontal
  heading: string
  description: string
}>

const SECTIONS: ReadonlyArray<ProjectSettingsSection> = [
  {
    key: "general",
    label: m.project_settings_general_tab(),
    icon: SlidersHorizontal,
    heading: m.project_settings_general_heading(),
    description: m.project_settings_general_description()
  },
  {
    key: "team",
    label: m.project_settings_team_tab(),
    icon: Users,
    heading: m.project_settings_team_heading(),
    description: m.project_settings_team_description()
  },
  {
    key: "workflow",
    label: m.project_settings_workflow_tab(),
    icon: Workflow,
    heading: m.project_settings_workflow_heading(),
    description: m.project_settings_workflow_description()
  },
  {
    key: "templates",
    label: m.project_settings_templates_tab(),
    icon: LayoutTemplate,
    heading: m.project_settings_templates_heading(),
    description: m.project_settings_templates_description()
  },
  {
    key: "integrations",
    label: m.project_settings_integrations_tab(),
    icon: GitBranch,
    heading: m.project_settings_integrations_heading(),
    description: m.project_settings_integrations_description()
  },
  {
    key: "danger",
    label: m.project_settings_danger_tab(),
    icon: TriangleAlert,
    heading: m.project_settings_danger_heading(),
    description: m.project_settings_danger_description()
  }
]

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings"
)({
  component: SettingsLayout,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_settings() }
  })
})

function SettingsLayout() {
  const { orgSlug, slug } = Route.useParams()
  const location = useLocation()
  const renderRail = useCallback(
    () => <SettingsRail orgSlug={orgSlug} slug={slug} />,
    [orgSlug, slug]
  )
  useSidebarSlot(`settings:${orgSlug}/${slug}`, renderRail)

  const activeSection =
    SECTIONS.find((section) => {
      const base = `/orgs/${orgSlug}/projects/${slug}/settings/${section.key}`
      return (
        location.pathname === base || location.pathname.startsWith(`${base}/`)
      )
    }) ?? SECTIONS[0]

  return (
    <SettingsPage
      heading={activeSection.heading}
      description={activeSection.description}
    >
      <Outlet />
    </SettingsPage>
  )
}

function projectSettingsLayoutId(orgSlug: string, slug: string) {
  return `project-settings-row:${orgSlug}/${slug}`
}

function SettingsRail({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  const reduceMotion = useReducedMotion()
  const canDelete = useAtomValue(
    projectActor(projectRequest(orgSlug, slug))
  ).call("projects", "delete")
  const projectResult = useAtomValue(project(projectRequest(orgSlug, slug)))
  const projectName = Result.isSuccess(projectResult)
    ? projectResult.value.name
    : slug
  const projectIcon = Result.isSuccess(projectResult)
    ? projectResult.value.icon
    : null
  const projectIconImage = Result.isSuccess(projectResult)
    ? projectResult.value.iconImage
    : null

  return (
    <Rail>
      <div className="flex flex-col gap-1">
        <RailBackLink
          to="/orgs/$orgSlug/projects/$slug"
          params={{ orgSlug, slug }}
          label={m.project_detail_tab_settings()}
        />
        <motion.div
          layoutId={
            reduceMotion ? undefined : projectSettingsLayoutId(orgSlug, slug)
          }
          transition={transitions.layout}
          className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2 text-[13px] text-foreground"
        >
          {projectIcon ? (
            <span
              aria-hidden
              className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-[13px] leading-none corner-squircle"
            >
              <ProjectIconDisplay
                orgSlug={orgSlug}
                icon={projectIcon}
                iconImage={projectIconImage}
                size={16}
              />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate font-medium">
            {projectName}
          </span>
        </motion.div>
      </div>
      <SettingsRailNav>
        {SECTIONS.filter(
          (section) => section.key !== "danger" || canDelete
        ).map((section, index) => (
          <SettingsRailLink
            key={section.key}
            index={index}
            to={`/orgs/$orgSlug/projects/$slug/settings/${section.key}`}
            params={{ orgSlug, slug }}
            icon={section.icon}
            label={section.label}
          />
        ))}
      </SettingsRailNav>
    </Rail>
  )
}
