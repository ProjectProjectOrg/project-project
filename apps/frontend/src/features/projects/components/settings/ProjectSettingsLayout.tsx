import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Outlet, useLocation } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
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
import {
  useProjectRoute,
  ProjectContext
} from "@/features/projects/hooks/useProject"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/$slug/settings")

export function ProjectSettingsLayout() {
  const { orgSlug, slug } = routeApi.useParams()
  const location = useLocation()
  const renderRail = useCallback(
    () => (
      <ProjectContext value={projectRequest(orgSlug, slug)}>
        <ProjectSettingsRail />
      </ProjectContext>
    ),
    [orgSlug, slug]
  )
  useSidebarSlot(`settings:${orgSlug}/${slug}`, renderRail)

  const activeSection =
    PROJECT_SETTINGS_SECTIONS.find((section) => {
      const base = `/orgs/${orgSlug}/projects/${slug}/settings/${section.key}`
      return (
        location.pathname === base || location.pathname.startsWith(`${base}/`)
      )
    }) ?? PROJECT_SETTINGS_SECTIONS[0]

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

function ProjectSettingsRail() {
  const { orgSlug, slug } = useProjectRoute()
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
          className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2 text-body text-foreground"
        >
          {projectIcon ? (
            <span
              aria-hidden
              className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-body leading-none corner-squircle"
            >
              <ProjectIconDisplay
                orgSlug={orgSlug}
                icon={projectIcon}
                iconImage={projectIconImage}
                size={16}
              />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate font-semibold">
            {projectName}
          </span>
        </motion.div>
      </div>
      <SettingsRailNav>
        {PROJECT_SETTINGS_SECTIONS.filter(
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
