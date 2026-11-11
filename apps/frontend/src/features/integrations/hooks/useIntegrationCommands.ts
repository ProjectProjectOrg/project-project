import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import {
  GitBranch,
  HardDrive,
  Mail,
  MessagesSquare,
  Shapes,
  Timer
} from "lucide-react"

import { me } from "@/features/auth/atoms/auth"
import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import {
  integrationCommands,
  type IntegrationCommandEntry
} from "@/features/integrations/lib/integrationCommands"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import {
  useEmailState,
  useGithubAppState,
  useSlackState,
  useStorageState
} from "./useOrgIntegrations"

export function useIntegrationCommands(
  context: CommandContext
): ReadonlyArray<Command> {
  const { orgSlug, projectSlug } = context
  const viewer = useAtomValue(me())
  const actor = useOrgActor(orgSlug)
  const canManageStorage = actor.call("storage", "connect")
  const canManageGithub = actor.call("projects", "githubInstallationChoices")
  const canManageSlack = actor.call("slack", "orgStatus")
  const canManageEmail = actor.call("orgEmail", "get")
  const storage = useStorageState(orgSlug, canManageStorage)
  const github = useGithubAppState(orgSlug, canManageGithub)
  const slack = useSlackState(orgSlug, canManageSlack)
  const email = useEmailState(orgSlug, canManageEmail)
  const orgParent = m.chrome_command_menu_settings_parent_org
  const orgPath = `/orgs/${orgSlug}/settings/integrations`
  const providers = [
    {
      key: "github",
      name: m.project_settings_github_heading(),
      icon: GitBranch,
      keywords: ["git", "repository", "repo", "pull request"],
      allowed: canManageGithub,
      state: github
    },
    {
      key: "storage",
      name: m.storage_heading(),
      icon: HardDrive,
      keywords: [
        "s3",
        "bucket",
        "attachments",
        "uploads",
        "images",
        "object storage"
      ],
      allowed: canManageStorage,
      state: storage,
      prerequisite: true
    },
    {
      key: "slack",
      name: m.slack_heading(),
      icon: MessagesSquare,
      keywords: ["notifications", "channel"],
      allowed: canManageSlack,
      state: slack
    },
    {
      key: "email",
      name: m.org_email_heading(),
      icon: Mail,
      keywords: ["smtp", "mail", "invitations"],
      allowed: canManageEmail,
      state: email
    },
    {
      key: "figma",
      name: m.figma_project_title(),
      icon: Shapes,
      keywords: ["design", "frames"],
      allowed: true
    },
    {
      key: "everhour",
      name: m.project_settings_everhour_heading(),
      icon: Timer,
      keywords: ["time", "tracking", "timer"],
      allowed: true
    }
  ]
  const entries: ReadonlyArray<IntegrationCommandEntry> = [
    ...providers.map((provider) => ({
      ...provider,
      id: `settings.org.integration.${provider.key}`,
      parent: orgParent,
      to: `${orgPath}/${provider.key}`
    })),
    ...providers.flatMap((provider) =>
      ["github", "figma", "everhour", "slack"].includes(provider.key)
        ? [
            {
              id: `settings.project.integration.${provider.key}`,
              name: provider.name,
              icon: provider.icon,
              keywords: provider.keywords,
              parent: m.chrome_command_menu_settings_parent_project,
              to: `/orgs/${orgSlug}/projects/${projectSlug ?? ""}/settings/integrations`,
              allowed: projectSlug !== null && context.canManageProject
            }
          ]
        : []
    ),
    {
      id: "settings.profile.integration.github",
      name:
        Result.isSuccess(viewer) && !viewer.value.personalGithub.connected
          ? m.profile_command_connect_github()
          : m.profile_command_github(),
      icon: GitBranch,
      keywords: [
        "github",
        "personal",
        "account",
        "oauth",
        "connection",
        "connect",
        "reconnect"
      ],
      parent: m.chrome_command_menu_settings_group_profile,
      to: "/profile/connections",
      allowed: true
    },
    {
      id: "settings.profile.integration.everhour",
      name:
        Result.isSuccess(viewer) && !viewer.value.personalEverhour.connected
          ? m.profile_everhour_connect_button()
          : m.profile_command_everhour(),
      icon: Timer,
      keywords: [
        "everhour",
        "personal",
        "account",
        "time",
        "tracking",
        "api key",
        "setup"
      ],
      parent: m.chrome_command_menu_settings_group_profile,
      to: "/profile/connections",
      allowed: true
    },
    {
      id: "settings.profile.integration.slack",
      name: m.slack_heading(),
      icon: MessagesSquare,
      keywords: ["personal", "account", "oauth", "connection"],
      parent: m.chrome_command_menu_settings_group_profile,
      to: "/profile/connections",
      allowed: true
    },
    {
      id: "settings.profile.integration.figma",
      name: m.figma_profile_title(),
      icon: Shapes,
      keywords: ["personal", "account", "design", "oauth", "connection"],
      parent: m.chrome_command_menu_settings_group_profile,
      to: "/profile/connections",
      allowed: true
    }
  ]
  return integrationCommands(entries)
}
