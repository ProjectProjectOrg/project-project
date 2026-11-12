import { useAtomSet } from "@effect/atom-react"
import {
  pickActiveSprint,
  sprintState,
  type Group,
  type UpdateGroupInput
} from "@pp/shared"
import { useMatch, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarX,
  CalendarRange,
  Columns3,
  FileText,
  Link2,
  ListPlus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Rows3,
  Trash2,
  Trophy,
  Zap
} from "lucide-react"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { SprintContext } from "@/features/command-menu/lib/commandMenu"
import type { Command } from "@/features/command-menu/lib/commands"
import {
  completeSprint,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { startSprintPatch } from "@/features/sprints/lib/sprintDates"
import { sprintNeighbours } from "@/features/sprints/lib/sprintTargets"
import { createTicketDialog } from "@/features/tickets/atoms/createTicketDialog"
import { useProjectView, type ProjectView } from "@/hooks/useViewPreference"
import { m } from "@/paraglide/messages"

import { useUnfinishedCount } from "./CompleteSprintMenu"
import { nowDate } from "./SprintHeaderFields"

export type ScopeProps = Readonly<{
  orgSlug: string
  slug: string
  sprints: ReadonlyArray<Group>
  canPlan: boolean
}>

const SPRINT_ROUTE =
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"

export const sprintPath = (orgSlug: string, slug: string, sprint: Group) =>
  `/orgs/${orgSlug}/projects/${slug}/sprints/${sprint.id}`

export const goTo = (
  id: string,
  label: () => string,
  icon: Command["icon"],
  to: string,
  group: Command["group"] = "navigation"
): Command => ({
  id,
  group,
  label,
  icon,
  run: (_context, env) => {
    env.navigate(to)
    env.close()
  }
})

const VIEWS = [
  { view: "list", label: m.sprints_command_view_list, icon: Rows3 },
  { view: "board", label: m.sprints_command_view_board, icon: Columns3 }
] as const

export const viewCommands = (
  current: ProjectView,
  show: (view: "list" | "board") => void
): ReadonlyArray<Command> =>
  VIEWS.flatMap(
    ({ view, label, icon }): ReadonlyArray<Command> =>
      view === current
        ? []
        : [
            {
              id: `view.${view}`,
              group: "view",
              label,
              icon,
              run: (_context, env) => {
                show(view)
                env.close()
              }
            }
          ]
  )

const lifecycleCommands = (
  sprint: Group,
  canPlan: boolean,
  update: (patch: UpdateGroupInput) => void,
  completeEmpty: (() => void) | null
): ReadonlyArray<Command> => {
  if (!canPlan) return []
  const state = sprintState(sprint)
  const commands: Array<Command> = []
  if (state === "planned") {
    commands.push(
      {
        id: "sprint.start",
        group: "sprint",
        label: m.sprints_start_button,
        icon: Play,
        run: (_context, env) => {
          update(startSprintPatch(sprint, nowDate()))
          env.close()
        }
      },
      {
        id: "sprint.schedule",
        group: "sprint",
        label: m.sprints_command_schedule,
        icon: CalendarClock,
        page: "sprintSchedule"
      }
    )
    if (sprint.startsAt !== null) {
      commands.push({
        id: "sprint.unschedule",
        group: "sprint",
        label: m.sprints_unschedule,
        icon: CalendarX,
        run: (_context, env) => {
          update({ startsAt: null, endsAt: null })
          env.close()
        }
      })
    }
  }
  if (state === "active") {
    commands.push(
      completeEmpty === null
        ? {
            id: "sprint.complete",
            group: "sprint",
            label: m.sprints_command_complete,
            icon: Trophy,
            page: "sprintComplete"
          }
        : {
            id: "sprint.complete",
            group: "sprint",
            label: m.sprints_complete_button,
            icon: Trophy,
            run: (_context, env) => {
              completeEmpty()
              env.close()
            }
          }
    )
  }
  if (state === "completed") {
    commands.push({
      id: "sprint.reopen",
      group: "sprint",
      label: m.sprints_reopen_button,
      icon: RotateCcw,
      run: (_context, env) => {
        update({ completedAt: null })
        env.close()
      }
    })
  }
  return commands
}

export function useSprintActions({
  orgSlug,
  slug,
  sprint,
  canPlan
}: SprintContext): ReadonlyArray<Command> {
  const update = useAtomSet(
    updateSprint({ req: sprintListRequest(orgSlug, slug), groupId: sprint.id })
  )
  const complete = useAtomSet(
    completeSprint({
      req: sprintListRequest(orgSlug, slug),
      groupId: sprint.id
    })
  )
  const unfinished = useUnfinishedCount({ orgSlug, slug, sprint })
  return useMemo(() => {
    const state = sprintState(sprint)
    const planning = canPlan && state !== "completed"
    const commands: Array<Command> = [
      ...lifecycleCommands(
        sprint,
        canPlan,
        update,
        unfinished === 0
          ? () => complete({ destination: { kind: "backlog" } })
          : null
      )
    ]
    if (state !== "completed") {
      commands.push({
        id: "sprint.create-ticket",
        group: "sprint",
        label: () => m.sprints_command_create_ticket({ name: sprint.name }),
        icon: Plus,
        keywords: ["new", "add", "issue", "ticket"],
        when: ({ tickets }) => tickets.create,
        run: (_context, env) => {
          env.close()
          env.registry.set(createTicketDialog, {
            orgSlug,
            projectSlug: slug,
            sprint: sprint.id
          })
        }
      })
    }
    if (planning) {
      commands.push({
        id: "sprint.add-tickets",
        group: "sprint",
        label: m.sprints_command_add_tickets,
        icon: ListPlus,
        page: "sprintAddTickets"
      })
      if (sprint.startsAt !== null) {
        commands.push({
          id: "sprint.length",
          group: "sprint",
          label: m.sprints_command_length,
          icon: CalendarRange,
          page: "sprintLength"
        })
      }
      commands.push({
        id: "sprint.rename",
        group: "sprint",
        label: m.sprints_command_rename,
        icon: Pencil,
        page: "sprintRename"
      })
    }
    if (canPlan) {
      commands.push({
        id: "sprint.delete",
        group: "sprint",
        label: m.sprints_command_delete,
        icon: Trash2,
        searchOnly: true,
        keywords: ["remove"],
        page: "sprintDelete"
      })
    }
    return commands
  }, [orgSlug, slug, sprint, canPlan, update, complete, unfinished])
}

export function SprintCommandScope({
  orgSlug,
  slug,
  sprints,
  canPlan,
  sprint
}: ScopeProps & Readonly<{ sprint: Group }>) {
  const navigate = useNavigate()
  const match = useMatch({ from: SPRINT_ROUTE, shouldThrow: false })
  const { view, setPreference } = useProjectView(
    orgSlug,
    slug,
    match?.search.view,
    "sprints"
  )
  const context = useMemo(
    () => ({ orgSlug, slug, sprint, sprints, canPlan }),
    [orgSlug, slug, sprint, sprints, canPlan]
  )
  const actions = useSprintActions(context)
  const scope = useMemo(() => {
    const planning = canPlan && sprintState(sprint) !== "completed"
    const { previous, next } = sprintNeighbours(sprints, sprint.id)
    const active = pickActiveSprint(sprints)
    const show = (next: ProjectView) => {
      if (next !== "description") setPreference(next)
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
        params: { orgSlug, slug, groupId: sprint.id },
        search: (prev) => ({
          ...prev,
          view: next
        })
      })
    }
    const commands: Array<Command> = [...actions]
    if (view !== "description") {
      commands.push({
        id: "sprint.goal",
        group: "sprint",
        label: planning
          ? m.sprints_command_edit_goal
          : m.sprints_command_open_goal,
        icon: FileText,
        run: (_context, env) => {
          show("description")
          env.close()
        }
      })
    }
    commands.push(...viewCommands(view, show))
    if (active !== null && active.id !== sprint.id) {
      commands.push(
        goTo(
          "sprint.go-active",
          () => m.sprints_command_go_active({ name: active.name }),
          Zap,
          sprintPath(orgSlug, slug, active)
        )
      )
    }
    if (previous !== null) {
      commands.push(
        goTo(
          "sprint.go-previous",
          () => m.sprints_command_go_previous({ name: previous.name }),
          ArrowLeft,
          sprintPath(orgSlug, slug, previous)
        )
      )
    }
    if (next !== null) {
      commands.push(
        goTo(
          "sprint.go-next",
          () => m.sprints_command_go_next({ name: next.name }),
          ArrowRight,
          sprintPath(orgSlug, slug, next)
        )
      )
    }
    commands.push({
      id: "sprint.copy-link",
      group: "miscellaneous",
      label: m.sprints_command_copy_link,
      icon: Link2,
      run: (_context, env) => {
        env.copy(
          `${window.location.origin}${sprintPath(orgSlug, slug, sprint)}`
        )
        env.close()
      }
    })
    return { sprint: context, commands }
  }, [
    context,
    actions,
    orgSlug,
    slug,
    sprint,
    sprints,
    canPlan,
    view,
    setPreference,
    navigate
  ])
  useCommandScope(scope)
  return null
}
