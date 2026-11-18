import { Settings } from "@pp/ui/icons"

import { ORG_SETTINGS_SECTIONS } from "@/features/organizations/lib/orgSettingsSections"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"
import { m } from "@/paraglide/messages"

import { Command, type CommandContext, type CommandEnv } from "./lib/commands"

export const projectScopeName = ({ project }: CommandContext) =>
  project?.name ?? m.chrome_command_menu_settings_parent_project()

export const orgScopeName = ({ orgName }: CommandContext) =>
  orgName ?? m.chrome_command_menu_settings_parent_org()

// One row per page: the providers a page manages are found through it.
const PROVIDER_KEYWORDS = ["github", "slack", "figma", "everhour"]

const go =
  (path: (orgSlug: string, projectSlug: string | null) => string) =>
  ({ orgSlug, projectSlug }: CommandContext, env: CommandEnv) => {
    env.navigate(path(orgSlug, projectSlug))
    env.close()
  }

export const settingsCommands: ReadonlyArray<Command> = [
  Command.page({
    id: "settings.search",
    group: "settings",
    label: m.chrome_command_menu_search_settings,
    icon: Settings,
    keywords: ["preferences", "configure"],
    page: "settings"
  }),
  ...PROJECT_SETTINGS_SECTIONS.map((section) =>
    Command.run({
      id: `settings.project.${section.key}`,
      group: "settings",
      parent: (context) => [projectScopeName(context)],
      label: () => section.label,
      icon: section.icon,
      keywords: section.key === "integrations" ? PROVIDER_KEYWORDS : undefined,
      listed: "search",
      when: ({ projectSlug }) => projectSlug !== null,
      run: go(
        (orgSlug, projectSlug) =>
          `/settings/orgs/${orgSlug}/projects/${projectSlug ?? ""}/${section.key}`
      )
    })
  ),
  ...ORG_SETTINGS_SECTIONS.map((section) =>
    Command.run({
      id: `settings.org.${section.key}`,
      group: "settings",
      parent: (context) => [orgScopeName(context)],
      label: () => section.label,
      icon: section.icon,
      listed: "search",
      when: ({ canSeeOrgMembers }) =>
        section.key !== "members" || canSeeOrgMembers,
      run: go((orgSlug) => section.to.replace("$orgSlug", orgSlug))
    })
  ),
  ...PROFILE_SECTIONS.map((section) =>
    Command.run({
      id: `settings.profile.${section.to}`,
      group: "settings",
      parent: () => [m.chrome_command_menu_settings_group_profile()],
      label: () => section.label,
      icon: section.icon,
      listed: "search",
      run: go(() => section.to)
    })
  )
]
