import { useAtomValue } from "@effect/atom-react"
import type { ProjectIconImage } from "@pp/shared"
import { Link, useLocation } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { FolderKanban, Settings } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef } from "react"

import {
  NavItem,
  navFocusRing,
  useNavHoverItem
} from "@/components/shell/NavItem"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const PROJECT_ROW_INDEX_OFFSET = 2

export function ProjectsGroup({
  orgSlug,
  expanded
}: {
  orgSlug: string
  expanded: boolean
}) {
  const { pathname } = useLocation()
  const reduceMotion = useReducedMotion()
  const listResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(listResult)
    ? [...listResult.value].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      )
    : []
  const activeSlug = matchActiveProjectSlug(pathname, orgSlug)

  return (
    <div
      className={cn(
        "-mx-1 rounded-lg p-1 transition-colors",
        expanded && "bg-accent"
      )}
    >
      <NavItem
        to="/orgs/$orgSlug/projects"
        params={{ orgSlug }}
        icon={FolderKanban}
        label={m.chrome_sidebar_projects()}
        index={1}
        fillWhenActive={false}
        className={expanded ? "rounded-sm" : undefined}
      />
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="projects-list"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={transitions.layout}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-0.5">
              {projects.map((p, i) => (
                <ProjectsGroupRow
                  key={p.slug}
                  index={PROJECT_ROW_INDEX_OFFSET + i}
                  orgSlug={orgSlug}
                  slug={p.slug}
                  name={p.name}
                  icon={p.icon}
                  iconImage={p.iconImage}
                  active={p.slug === activeSlug}
                />
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function projectSettingsLayoutId(orgSlug: string, slug: string) {
  return `project-settings-row:${orgSlug}/${slug}`
}

function ProjectsGroupRow({
  index,
  orgSlug,
  slug,
  name,
  icon,
  iconImage,
  active
}: {
  index: number
  orgSlug: string
  slug: string
  name: string
  icon: string
  iconImage: ProjectIconImage | null
  active: boolean
}) {
  const reduceMotion = useReducedMotion()
  const settingsLabel = m.project_sidebar_settings_aria_label({ name })
  const rowRef = useRef<HTMLLIElement>(null)
  useNavHoverItem(index, rowRef)

  return (
    <motion.li
      ref={rowRef}
      layoutId={
        reduceMotion ? undefined : projectSettingsLayoutId(orgSlug, slug)
      }
      transition={transitions.layout}
      className="group/project-row relative z-10 flex items-center rounded-sm"
    >
      <Link
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-sm py-2 pr-1 pl-3 text-[13px] transition-colors",
          navFocusRing,
          active
            ? "font-medium text-foreground"
            : "text-muted-foreground group-data-[fluid-hover-active]/project-row:text-foreground"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-[13px] leading-none transition-[filter,opacity] duration-150 corner-squircle",
            !active && "opacity-60 grayscale"
          )}
        >
          <ProjectIconDisplay
            orgSlug={orgSlug}
            icon={icon}
            iconImage={iconImage}
            size={16}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </Link>
      <Link
        to="/orgs/$orgSlug/projects/$slug/settings"
        params={{ orgSlug, slug }}
        aria-label={settingsLabel}
        title={settingsLabel}
        className={cn(
          "mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors transition-transform duration-100 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]",
          "opacity-0 group-focus-within/project-row:opacity-100 group-hover/project-row:opacity-100 group-data-[fluid-hover-active]/project-row:opacity-100"
        )}
      >
        <Settings className="size-3.5" strokeWidth={1.75} />
      </Link>
    </motion.li>
  )
}

function matchActiveProjectSlug(
  pathname: string,
  orgSlug: string
): string | null {
  const prefix = `/orgs/${orgSlug}/projects/`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  const slug = rest.split("/")[0]
  return slug.length > 0 ? slug : null
}
