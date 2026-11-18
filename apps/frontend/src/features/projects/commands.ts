import {
  CalendarClock,
  FolderKanban,
  FolderPlus,
  Info,
  ListTodo,
  Timer
} from "@pp/ui/icons"

import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

const projectPath = ({ orgSlug, projectSlug }: CommandContext) =>
  `/orgs/${orgSlug}/projects/${projectSlug ?? ""}`

const inProject = (context: CommandContext) => context.projectSlug !== null

export const projectCommands: ReadonlyArray<Command> = [
  {
    id: "project.switch",
    hotkey: appHotkeys["nav.projects"],
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
    hotkey: appHotkeys["nav.backlog"],
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
    hotkey: appHotkeys["nav.sprints"],
    group: "navigation",
    label: m.chrome_command_menu_go_sprints,
    icon: Timer,
    keywords: ["active", "current", "sprint"],
    when: inProject,
    run: (context, env) => {
      env.navigate(`${projectPath(context)}/sprints`)
      env.close()
    }
  },
  {
    id: "project.current-sprint",
    hotkey: appHotkeys["nav.current-sprint"],
    group: "navigation",
    label: m.chrome_command_menu_go_current_sprint,
    icon: CalendarClock,
    keywords: ["active", "sprint"],
    when: inProject,
    run: (context, env) => {
      env.navigate(`${projectPath(context)}/sprints/current`)
      env.close()
    }
  },
  {
    id: "project.about",
    hotkey: appHotkeys["nav.about"],
    group: "navigation",
    label: m.chrome_command_menu_go_about,
    icon: Info,
    keywords: ["overview", "readme", "links"],
    when: inProject,
    run: (context, env) => {
      env.navigate(`${projectPath(context)}/about`)
      env.close()
    }
  }
]
