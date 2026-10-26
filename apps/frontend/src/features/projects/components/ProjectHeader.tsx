import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy, ProjectPolicy } from "@pp/access/policies"
import type { ProjectDetail as ProjectDetailType } from "@pp/shared"
import { Link, useMatches } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowLeft,
  FileText,
  MoreHorizontal,
  SlidersHorizontal
} from "lucide-react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { GithubChip } from "@/features/github/components/GithubChip"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { ActiveSprintLine } from "@/features/sprints/components/ActiveSprintLine"
import {
  SprintDeleteMenu,
  SprintNameField,
  SprintStatusSelect,
  SprintSubtitle
} from "@/features/sprints/components/SprintHeaderFields"
import { useProjectActor } from "@/lib/access"
import { springs, transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const morphFrom = { opacity: 0, filter: "blur(4px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }

function MorphSlot({
  slotKey,
  layoutId,
  reduce,
  className,
  children
}: {
  slotKey: string
  layoutId?: string
  reduce: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={slotKey}
        layout={layoutId ? "position" : undefined}
        layoutId={layoutId}
        initial={reduce ? false : morphFrom}
        animate={morphTo}
        exit={reduce ? { opacity: 0 } : morphFrom}
        transition={
          layoutId
            ? {
                layout: springs.moderate,
                opacity: transitions.presence,
                filter: transitions.presence
              }
            : transitions.presence
        }
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function ProjectHeader({
  name,
  project
}: {
  name: string
  project: ProjectDetailType
}) {
  const { orgSlug, slug } = useProjectRoute()
  const actor = useProjectActor()
  const canEdit = ProjectPolicy.canUpdate(actor, { settings: true })
  const reduce = useReducedMotion() ?? false

  const matches = useMatches()
  const sprintMatch = matches.find(
    (mt) =>
      mt.routeId ===
      "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
  )
  const sprintGroupId = sprintMatch
    ? (sprintMatch.params as { groupId: string }).groupId
    : null

  const sprintReq = sprintListRequest(orgSlug, slug)
  const sprintsResult = useAtomValue(sprintList(sprintReq))
  const sprintsLoaded = Result.isSuccess(sprintsResult)
  const sprints = sprintsLoaded ? sprintsResult.value : []
  const sprint = sprintGroupId
    ? sprints.find((s) => s.id === sprintGroupId)
    : undefined
  const sprintMissing = sprintGroupId != null && sprintsLoaded && !sprint

  const mode = sprintGroupId ? `sprint:${sprintGroupId}` : "project"
  const isCompleted = sprint?.completedAt != null
  const canPlan = GroupPolicy.can(actor, "sprint", "manage")

  return (
    <LayoutGroup id={`project-header-${slug}`}>
      <header className="flex items-start gap-3">
        <MorphSlot
          slotKey={mode}
          layoutId="project-header-icon"
          reduce={reduce}
        >
          {sprintGroupId ? (
            sprint ? (
              <fieldset disabled={!canPlan} className="contents">
                <SprintStatusSelect sprint={sprint} sprints={sprints} />
              </fieldset>
            ) : sprintMissing ? (
              <div className="-mt-1 size-10 shrink-0 rounded-lg bg-muted/40" />
            ) : (
              <div className="-mt-1 size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
            )
          ) : (
            <div className="-mt-1 w-fit shrink-0">
              <ProjectIconTile
                orgSlug={orgSlug}
                icon={project.icon}
                iconImage={project.iconImage}
                color={project.color}
                size="md"
                seed={slug}
              />
            </div>
          )}
        </MorphSlot>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <MorphSlot
            slotKey={mode}
            layoutId="project-header-title"
            reduce={reduce}
            className="flex h-8 max-w-full min-w-0 items-baseline gap-2"
          >
            {sprintGroupId ? (
              sprint ? (
                <>
                  <SprintNameField
                    sprint={sprint}
                    disabled={isCompleted || !canPlan}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={
                      sprintMatch?.search.view === "description"
                        ? ArrowLeft
                        : FileText
                    }
                    render={
                      <Link
                        to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
                        params={{ orgSlug, slug, groupId: sprint.id }}
                        search={(previous) => ({
                          ...previous,
                          updatedAfter: previous.updatedAfter?.toISOString(),
                          view:
                            previous.view === "description"
                              ? undefined
                              : "description"
                        })}
                      />
                    }
                  >
                    {sprintMatch?.search.view === "description"
                      ? m.sprints_back_to_tickets()
                      : m.sprints_about_button()}
                  </Button>
                </>
              ) : sprintMissing ? (
                <span className="truncate text-2xl font-semibold tracking-tight text-muted-foreground">
                  {m.sprints_not_found_title()}
                </span>
              ) : (
                <div className="h-6 w-40 animate-pulse rounded bg-muted/60" />
              )
            ) : (
              <NameField name={name} canEdit={canEdit} />
            )}
          </MorphSlot>
          <MorphSlot
            slotKey={mode}
            layoutId="project-header-subtitle"
            reduce={reduce}
            className="flex h-5 items-center"
          >
            {sprintGroupId ? (
              sprint ? (
                <SprintSubtitle
                  sprint={sprint}
                  disabled={isCompleted || !canPlan}
                />
              ) : sprintMissing ? null : (
                <div className="h-3.5 w-28 animate-pulse rounded bg-muted/60" />
              )
            ) : (
              <ActiveSprintLine />
            )}
          </MorphSlot>
        </div>

        <MorphSlot slotKey={mode} reduce={reduce}>
          {sprintGroupId ? (
            sprint ? (
              canPlan ? (
                <SprintDeleteMenu sprint={sprint} sprints={sprints} />
              ) : null
            ) : sprintMissing ? null : (
              <div className="size-8" />
            )
          ) : (
            <div className="flex items-center gap-3">
              {actor.call("projects", "gitStates") && (
                <GithubChip github={project.github} />
              )}
              <ProjectMenu />
            </div>
          )}
        </MorphSlot>
      </header>
    </LayoutGroup>
  )
}

function NameField({ name, canEdit }: { name: string; canEdit: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const update = useAtomSet(updateProject(req), { mode: "promiseExit" })
  const updateState = useAtomValue(updateProject(req))
  const saving = updateState.waiting
  const failed = Result.isFailure(updateState)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [editing, name])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      setDraft(name)
      return
    }
    const exit = await update({ name: trimmed })
    if (Exit.isSuccess(exit)) setEditing(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setDraft(name)
      setEditing(false)
    }
  }

  if (!canEdit || !editing) {
    return (
      <button
        type="button"
        onClick={() => canEdit && setEditing(true)}
        disabled={!canEdit}
        className={cn(
          "-mx-1 truncate rounded px-1 text-left text-2xl font-semibold tracking-tight transition-colors transition-transform duration-100 active:scale-[0.97]",
          canEdit && "hover:bg-hover"
        )}
      >
        {name}
      </button>
    )
  }
  return (
    <div className="relative w-full">
      <input
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKey}
        className="-mx-1 w-full rounded bg-transparent px-1 text-2xl font-semibold tracking-tight ring-2 ring-ring/50 outline-none"
        maxLength={120}
        aria-label={m.project_detail_name_aria_label()}
      />
      {failed && (
        <p
          role="alert"
          className="absolute top-full left-0 mt-1 text-xs text-destructive"
        >
          {m.project_detail_name_error()}
        </p>
      )}
    </div>
  )
}

function ProjectMenu() {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="quiet"
            size="square-8"
            aria-label={m.project_detail_actions_aria_label()}
            className="focus-visible:ring-2"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        <DropdownMenuItem
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/settings"
              params={{ orgSlug, slug }}
            />
          }
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
          {m.project_detail_tab_settings()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
