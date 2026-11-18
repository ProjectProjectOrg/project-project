import { ORG_SETTINGS_SECTIONS } from "@/features/organizations/lib/orgSettingsSections"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"
import { m } from "@/paraglide/messages"

import type { Command, CommandContext, CommandEnv } from "./lib/commands"

const go =
  (path: (orgSlug: string, projectSlug: string | null) => string) =>
  ({ orgSlug, projectSlug }: CommandContext, env: CommandEnv) => {
    env.navigate(path(orgSlug, projectSlug))
    env.close()
  }

export const settingsCommands: ReadonlyArray<Command> = [
  ...PROJECT_SETTINGS_SECTIONS.filter(
    (section) => section.key !== "danger"
  ).map(
    (section): Command => ({
      id: `settings.project.${section.key}`,
      group: "navigation",
      parent: m.chrome_command_menu_settings_parent_project,
      label: () => section.label,
      icon: section.icon,
      searchOnly: true,
      when: ({ projectSlug }) => projectSlug !== null,
      run: go(
        (orgSlug, projectSlug) =>
          `/orgs/${orgSlug}/projects/${projectSlug ?? ""}/settings/${section.key}`
      )
    })
  ),
  ...ORG_SETTINGS_SECTIONS.map(
    (section): Command => ({
      id: `settings.org.${section.key}`,
      group: "navigation",
      parent: m.chrome_command_menu_settings_parent_org,
      label: () => section.label,
      icon: section.icon,
      searchOnly: true,
      when: ({ canSeeOrgMembers }) =>
        section.key !== "members" || canSeeOrgMembers,
      run: go((orgSlug) => section.to.replace("$orgSlug", orgSlug))
    })
  ),
  ...PROFILE_SECTIONS.map(
    (section): Command => ({
      id: `settings.profile.${section.to}`,
      group: "navigation",
      parent: m.chrome_command_menu_settings_group_profile,
      label: () => section.label,
      icon: section.icon,
      searchOnly: true,
      run: go(() => section.to)
    })
  )
]
