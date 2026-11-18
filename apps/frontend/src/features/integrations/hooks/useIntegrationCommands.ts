import { useAtomValue } from "@effect/atom-react"
import {
  GitBranch,
  HardDrive,
  Mail,
  MessagesSquare,
  Shapes,
  Timer
} from "@pp/ui/icons"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import type { CommandContext } from "@/features/command-menu/lib/commands"
import { orgScopeName } from "@/features/command-menu/settingsCommands"
import {
  integrationCommands,
  type IntegrationCommandEntry
} from "@/features/integrations/lib/integrationCommands"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import {
  useEmailState,
  useGithubAppState,
  useGithubSetupStep,
  useSlackState,
  useStorageState
} from "./useOrgIntegrations"

export function useIntegrationCommands(context: CommandContext) {
  const { orgSlug } = context
  const actor = useOrgActor(orgSlug)
  const canManageStorage = actor.call("storage", "connect")
  const canManageGithub = actor.call("projects", "githubInstallationChoices")
  const canManageSlack = actor.call("slack", "orgStatus")
  const canManageEmail = actor.call("orgEmail", "get")
  const storage = useStorageState(orgSlug, canManageStorage)
  const github = useGithubAppState(orgSlug, canManageGithub)
  const githubStep = useGithubSetupStep(orgSlug, canManageGithub)
  const githubConnect =
    githubStep === "register" &&
    actor.call("projects", "startGithubAppManifest")
      ? {
          label: m.github_command_register_app(),
          page: "githubRegisterApp" as const
        }
      : githubStep === "install" && actor.call("projects", "startGithubInstall")
        ? {
            label: m.github_command_connect_installation(),
            page: "githubInstallApp" as const
          }
        : undefined
  const viewer = useAtomValue(me())
  const slack = useSlackState(orgSlug, canManageSlack)
  const email = useEmailState(orgSlug, canManageEmail)
  const orgParent = (scope: CommandContext) => [
    orgScopeName(scope),
    m.org_settings_integrations_tab()
  ]
  const orgPath = `/settings/orgs/${orgSlug}/integrations`
  const providers = [
    {
      key: "github",
      name: m.project_settings_github_heading(),
      icon: GitBranch,
      keywords: [
        "git",
        "repository",
        "repo",
        "pull request",
        "app registration",
        "installation"
      ],
      allowed: canManageGithub,
      state: github,
      connect: githubConnect
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
  const profileParent = () => [
    m.chrome_command_menu_settings_group_profile(),
    m.profile_section_connections_title()
  ]
  const connections = "/settings/profile/connections"
  const personal = Result.isSuccess(viewer) ? viewer.value : null
  const entries: ReadonlyArray<IntegrationCommandEntry> = [
    ...providers.map((provider) => ({
      ...provider,
      id: `settings.org.integration.${provider.key}`,
      parent: orgParent,
      to: `${orgPath}/${provider.key}`
    })),
    {
      id: "settings.profile.integration.github",
      name:
        personal?.personalGithub.connected === false
          ? m.profile_command_connect_github()
          : m.profile_command_github(),
      icon: GitBranch,
      keywords: ["github", "personal", "account", "oauth", "branches"],
      parent: profileParent,
      to: connections,
      allowed: true
    },
    {
      id: "settings.profile.integration.everhour",
      name:
        personal?.personalEverhour.connected === false
          ? m.profile_command_connect_everhour()
          : m.profile_command_everhour(),
      icon: Timer,
      keywords: ["everhour", "personal", "account", "time", "api key"],
      parent: profileParent,
      to: connections,
      allowed: true
    },
    {
      id: "settings.profile.integration.slack",
      name: m.profile_command_slack(),
      icon: MessagesSquare,
      keywords: ["slack", "personal", "account", "oauth"],
      parent: profileParent,
      to: connections,
      allowed: true
    },
    {
      id: "settings.profile.integration.figma",
      name: m.profile_command_figma(),
      icon: Shapes,
      keywords: ["figma", "personal", "account", "design", "oauth"],
      parent: profileParent,
      to: connections,
      allowed: true
    }
  ]
  return integrationCommands(entries)
}
