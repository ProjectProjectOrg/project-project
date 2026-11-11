import { pickActiveSprint, pickEarliestPlannedSprint } from "@pp/shared"
import { useMatch, useNavigate } from "@tanstack/react-router"
import { Flag, Zap } from "lucide-react"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { Command } from "@/features/command-menu/lib/commands"
import { createSprintDialog } from "@/features/sprints/atoms/createSprintDialog"
import { useProjectView } from "@/hooks/useViewPreference"
import { m } from "@/paraglide/messages"

import {
  goTo,
  sprintPath,
  viewCommands,
  type ScopeProps
} from "./SprintCommandScopes"

const BACKLOG_ROUTE = "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"

export function BacklogCommandScope({
  orgSlug,
  slug,
  sprints,
  canPlan
}: ScopeProps) {
  const navigate = useNavigate()
  const match = useMatch({ from: BACKLOG_ROUTE, shouldThrow: false })
  const { view, setPreference } = useProjectView(
    orgSlug,
    slug,
    match?.search.view,
    "backlog"
  )
  const scope = useMemo(() => {
    const active = pickActiveSprint(sprints)
    const planned = pickEarliestPlannedSprint(sprints)
    const show = (next: "list" | "board") => {
      setPreference(next)
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug",
        params: { orgSlug, slug },
        search: (prev) => ({
          ...prev,
          view: next
        })
      })
    }
    const commands: Array<Command> = []
    if (canPlan && planned !== null) {
      commands.push({
        id: "backlog.plan",
        group: "backlog",
        label: () => m.sprints_command_plan({ name: planned.name }),
        icon: Flag,
        keywords: ["sprint"],
        page: "sprintPlan"
      })
    } else if (canPlan) {
      commands.push({
        id: "backlog.plan-new",
        group: "backlog",
        label: m.sprints_command_plan_new,
        icon: Flag,
        run: (_context, env) => {
          env.close()
          env.registry.set(createSprintDialog, { orgSlug, projectSlug: slug })
        }
      })
    }
    if (active !== null) {
      commands.push(
        goTo(
          "backlog.go-active",
          () => m.sprints_command_go_active({ name: active.name }),
          Zap,
          sprintPath(orgSlug, slug, active),
          "backlog"
        )
      )
    }
    commands.push(...viewCommands(view, show))
    return {
      sprint:
        planned === null
          ? undefined
          : { orgSlug, slug, sprint: planned, sprints, canPlan },
      commands
    }
  }, [orgSlug, slug, sprints, canPlan, view, setPreference, navigate])
  useCommandScope(scope)
  return null
}
