import { ListTodo, Timer } from "lucide-react"

import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

const projectPath = ({ orgSlug, projectSlug }: CommandContext) =>
  `/orgs/${orgSlug}/projects/${projectSlug ?? ""}`

const inProject = (context: CommandContext) => context.projectSlug !== null

export const projectCommands: ReadonlyArray<Command> = [
  {
    id: "project.backlog",
    group: "navigation",
    label: m.chrome_command_menu_go_backlog,
    icon: ListTodo,
    when: inProject,
    run: (context, env) => {
      env.navigate(projectPath(context))
      env.close()
    }
  },
  {
    id: "project.sprints",
    group: "navigation",
    label: m.chrome_command_menu_go_sprints,
    icon: Timer,
    when: inProject,
    run: (context, env) => {
      env.navigate(`${projectPath(context)}/sprints`)
      env.close()
    }
  }
]
