import type { Group } from "@pp/shared"
import { Columns3, Rows3 } from "@pp/ui/icons"

import { Command } from "@/features/command-menu/lib/commands"
import type { ProjectView } from "@/hooks/useViewPreference"
import { m } from "@/paraglide/messages"

export const sprintPath = (orgSlug: string, slug: string, sprint: Group) =>
  `/orgs/${orgSlug}/projects/${slug}/sprints/${sprint.id}`

export const goTo = (
  id: string,
  label: () => string,
  icon: Command["icon"],
  to: string,
  group: Command["group"] = "navigation"
) =>
  Command.run({
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
) =>
  VIEWS.flatMap(({ view, label, icon }) =>
    view === current
      ? []
      : [
          Command.run({
            id: `view.${view}`,
            group: "view",
            label,
            icon,
            run: (_context, env) => {
              show(view)
              env.close()
            }
          })
        ]
  )
