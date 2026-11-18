import {
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Layers,
  Unlink
} from "@pp/ui/icons"

import {
  Command,
  type CommandContext
} from "@/features/command-menu/lib/commands"
import { clearBranch } from "@/features/github/atoms/github"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { ticketRepo } from "@/features/github/lib/repos"
import { projectRequest } from "@/features/projects/atoms/projects"
import { onLiveTicket } from "@/features/tickets/commands"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

const repoOf = ({ project, ticketData }: CommandContext) =>
  project === null ? null : ticketRepo(project, ticketData?.repoId)

const openExternal = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer")
}

export const gitCommands: ReadonlyArray<Command> = [
  Command.run({
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
        `/settings/orgs/${orgSlug}/projects/${projectSlug ?? ""}/integrations`
      )
      env.close()
    }
  }),
  Command.page({
    id: "git.create-branch",
    group: "ticketGit",
    label: m.tickets_command_create_branch,
    icon: GitBranch,
    keywords: ["git", "github"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketData !== null &&
      context.ticketData.branch === null &&
      context.projectActor?.call("tickets", "createBranch") === true &&
      repoOf(context) !== null,
    page: "ticketBranch"
  }),
  Command.page({
    id: "git.link-branch",
    group: "ticketGit",
    label: m.tickets_command_link_branch,
    icon: GitBranch,
    keywords: ["git", "github", "attach", "existing"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketData !== null &&
      context.ticketData.branch === null &&
      context.projectActor?.call("tickets", "attachBranch") === true &&
      repoOf(context) !== null,
    page: "ticketLinkBranch"
  }),
  Command.page({
    id: "git.stack-branch",
    group: "ticketGit",
    label: m.tickets_command_stack_branch,
    icon: Layers,
    keywords: ["git", "github", "stack"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketData?.branch != null &&
      context.tickets.stackBranch &&
      repoOf(context) !== null,
    page: "ticketStackBranch"
  }),
  Command.run({
    id: "git.unlink-branch",
    group: "ticketGit",
    label: m.tickets_command_unlink_branch,
    icon: Unlink,
    keywords: ["git", "github", "detach", "clear"],
    when: (context) =>
      onLiveTicket(context) &&
      context.ticketData?.branch != null &&
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
  }),
  Command.run({
    id: "git.copy-branch",
    hotkey: appHotkeys["tickets.copy-branch"],
    group: "ticketGit",
    label: m.tickets_command_copy_branch,
    icon: Copy,
    keywords: ["git"],
    when: ({ ticketData, projectActor }) =>
      projectActor?.call("projects", "gitStates") === true &&
      ticketData !== null &&
      ticketData.branch !== null,
    run: ({ ticketData }, env) => {
      if (ticketData?.branch) env.copy(ticketData.branch)
      env.close()
    }
  }),
  Command.run({
    id: "git.open-branch",
    group: "ticketGit",
    label: m.tickets_command_open_branch,
    icon: ExternalLink,
    keywords: ["git", "github"],
    when: (context) =>
      context.projectActor?.call("projects", "gitStates") === true &&
      context.ticketData?.branch != null &&
      repoOf(context) !== null,
    run: (context, env) => {
      const github = repoOf(context)
      const branch = context.ticketData?.branch
      if (github !== null && branch) {
        openExternal(`${repoUrl(github)}/tree/${encodeURIComponent(branch)}`)
      }
      env.close()
    }
  }),
  Command.run({
    id: "git.open-pr",
    group: "ticketGit",
    label: m.tickets_command_open_pr,
    icon: GitPullRequest,
    keywords: ["git", "github", "pull request"],
    when: (context) =>
      context.projectActor?.call("projects", "gitStates") === true &&
      context.ticketData?.pr != null &&
      repoOf(context) !== null,
    run: (context, env) => {
      const github = repoOf(context)
      const pr = context.ticketData?.pr
      if (github !== null && pr != null) {
        openExternal(`${repoUrl(github)}/pull/${pr}`)
      }
      env.close()
    }
  })
]
