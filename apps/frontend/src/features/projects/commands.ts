import { FolderKanban, FolderPlus, ListTodo, Timer } from "lucide-react"

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
    id: "project.switch",
    group: "navigation",
    label: m.chrome_command_menu_switch_project,
    icon: FolderKanban,
    keywords: ["project", "go to", "open"],
    page: "switchProject"
  },
  {
    id: "project.create",
    group: "create",
    label: m.chrome_command_menu_create_project,
    icon: FolderPlus,
    keywords: ["new", "add"],
    when: ({ canCreateProjects }) => canCreateProjects,
    page: "createProject"
  },
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
    keywords: ["active", "current", "sprint"],
    when: inProject,
    run: (context, env) => {
      env.navigate(`${projectPath(context)}/sprints`)
      env.close()
    }
  }
]
