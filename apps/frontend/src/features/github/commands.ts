import {
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Layers,
  Unlink
} from "lucide-react"

import type {
  Command,
  CommandContext
} from "@/features/command-menu/lib/commands"
import { clearBranch } from "@/features/github/atoms/github"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { ticketRepo } from "@/features/github/lib/repos"
import { projectRequest } from "@/features/projects/atoms/projects"
import { onLiveTicket } from "@/features/tickets/commands"
import { m } from "@/paraglide/messages"

const repoOf = ({ project, ticketDetail }: CommandContext) =>
  project === null ? null : ticketRepo(project, ticketDetail?.repoId)

const openExternal = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer")
}

export const gitCommands: ReadonlyArray<Command> = [
  {
    id: "git.register-app",
    group: "settings",
    label: m.github_command_register_app,
    parent: m.chrome_command_menu_settings_parent_org,
    icon: GitBranch,
    keywords: ["github", "app", "registration", "credentials", "setup"],
    when: ({ orgActor }) => orgActor.call("projects", "startGithubAppManifest"),
    page: "githubRegisterApp"
  },
  {
    id: "git.connect-installation",
    group: "settings",
    label: m.github_apps_install_button,
    parent: m.chrome_command_menu_settings_parent_org,
    icon: GitBranch,
    keywords: [
      "github",
      "app",
      "installation",
      "account",
      "organization",
      "repository access"
    ],
    when: ({ orgActor }) => orgActor.call("projects", "startGithubInstall"),
    page: "githubInstallApp"
  },
  {
    id: "git.connect-repo",
    group: "settings",
    label: m.github_command_add_repository,
    icon: GitBranch,
    keywords: ["git", "github", "repository", "integration"],
    when: ({ projectSlug, projectActor }) =>
      projectSlug !== null &&
      projectActor?.call("projects", "connectGithub") === true,
    run: ({ orgSlug, projectSlug }, env) => {
      env.navigate(
        `/orgs/${orgSlug}/projects/${projectSlug ?? ""}/settings/integrations`
      )
      env.close()
    }
  },
  {
    id: "git.create-branch",
    group: "ticketGit",
    label: m.tickets_command_create_branch,
    icon: GitBranch,
    keywords: ["git", "github"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketDetail !== null &&
      context.ticketDetail.branch === null &&
      context.projectActor?.call("tickets", "createBranch") === true &&
      repoOf(context) !== null,
    page: "ticketBranch"
  },
  {
    id: "git.link-branch",
    group: "ticketGit",
    label: m.tickets_command_link_branch,
    icon: GitBranch,
    keywords: ["git", "github", "attach", "existing"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketDetail !== null &&
      context.ticketDetail.branch === null &&
      context.projectActor?.call("tickets", "attachBranch") === true &&
      repoOf(context) !== null,
    page: "ticketLinkBranch"
  },
  {
    id: "git.stack-branch",
    group: "ticketGit",
    label: m.tickets_command_stack_branch,
    icon: Layers,
    keywords: ["git", "github", "stack"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketDetail?.branch != null &&
      context.tickets.stackBranch &&
      repoOf(context) !== null,
    page: "ticketStackBranch"
  },
  {
    id: "git.unlink-branch",
    group: "ticketGit",
    label: m.tickets_command_unlink_branch,
    icon: Unlink,
    keywords: ["git", "github", "detach", "clear"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketDetail?.branch != null &&
      context.tickets.clearBranch,
    run: ({ ticket }, env) => {
      if (ticket === null) return
      env.execute(
        clearBranch({
          req: projectRequest(ticket.orgSlug, ticket.slug),
          id: ticket.ticketId
        }),
        undefined
      )
      env.close()
    }
  },
  {
    id: "git.copy-branch",
    group: "ticketGit",
    label: m.tickets_command_copy_branch,
    icon: Copy,
    keywords: ["git"],
    when: ({ ticketDetail, projectActor }) =>
      projectActor?.call("projects", "gitStates") === true &&
      ticketDetail !== null &&
      ticketDetail.branch !== null,
    run: ({ ticketDetail }, env) => {
      if (ticketDetail?.branch) env.copy(ticketDetail.branch)
      env.close()
    }
  },
  {
    id: "git.open-branch",
    group: "ticketGit",
    label: m.tickets_command_open_branch,
    icon: ExternalLink,
    keywords: ["git", "github"],
    when: (context) =>
      context.projectActor?.call("projects", "gitStates") === true &&
      context.ticketDetail?.branch != null &&
      repoOf(context) !== null,
    run: (context, env) => {
      const github = repoOf(context)
      const branch = context.ticketDetail?.branch
      if (github !== null && branch) {
        openExternal(`${repoUrl(github)}/tree/${encodeURIComponent(branch)}`)
      }
      env.close()
    }
  },
  {
    id: "git.open-pr",
    group: "ticketGit",
    label: m.tickets_command_open_pr,
    icon: GitPullRequest,
    keywords: ["git", "github", "pull request"],
    when: (context) =>
      context.projectActor?.call("projects", "gitStates") === true &&
      context.ticketDetail?.pr != null &&
      repoOf(context) !== null,
    run: (context, env) => {
      const github = repoOf(context)
      const pr = context.ticketDetail?.pr
      if (github !== null && pr != null) {
        openExternal(`${repoUrl(github)}/pull/${pr}`)
      }
      env.close()
    }
  }
]
