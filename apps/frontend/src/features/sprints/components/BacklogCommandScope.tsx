import { pickActiveSprint, pickEarliestPlannedSprint } from "@pp/shared"
import { Flag, Plus, Zap } from "@pp/ui/icons"
import { useMatch, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { Command } from "@/features/command-menu/lib/commands"
import { newSprintRequest } from "@/features/sprints/atoms/createSprint"
import {
  goTo,
  sprintPath,
  viewCommands
} from "@/features/sprints/lib/sprintCommands"
import { newTicketRequest } from "@/features/tickets/atoms/createTicket"
import { useProjectView } from "@/hooks/useViewPreference"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { type ScopeProps } from "./SprintCommandScopes"

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
      commands.push(
        Command.page({
          id: "backlog.plan",
          group: "backlog",
          label: () => m.sprints_command_plan({ name: planned.name }),
          icon: Flag,
          keywords: ["sprint"],
          page: "sprintPlan"
        })
      )
    } else if (canPlan) {
      commands.push(
        Command.run({
          id: "backlog.plan-new",
          group: "backlog",
          label: m.sprints_command_plan_new,
          icon: Flag,
          run: (_context, env) => {
            env.registry.set(newSprintRequest, { orgSlug, projectSlug: slug })
            env.open("createSprint")
          }
        })
      )
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
    if (planned !== null) {
      commands.push(
        Command.run({
          id: "backlog.create-ticket",
          hotkey: appHotkeys["tickets.create-anywhere"],
          group: "create",
          label: m.tickets_command_create,
          icon: Plus,
          keywords: ["new", "add", "issue"],
          when: ({ tickets }) => tickets.create,
          run: (_context, env) => {
            env.registry.set(newTicketRequest, { orgSlug, projectSlug: slug })
            env.open("createTicket")
          }
        })
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
