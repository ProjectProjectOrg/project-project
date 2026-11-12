import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowUpRight,
  Copy,
  GitBranch,
  GitPullRequest,
  Layers,
  Unlink
} from "lucide-react"
import { useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { clearBranch } from "@/features/github/atoms/github"
import { usePreferredBranchLink } from "@/features/github/components/ticket-git/BranchChip"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { ticketRepo } from "@/features/github/lib/repos"
import { project } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

type BranchTicket = Pick<TicketMenuTicket, "id" | "branch" | "pr" | "repoId">

export function BranchSubmenu({
  ticket,
  canStack,
  canUnlink
}: Readonly<{
  ticket: BranchTicket
  canStack: boolean
  canUnlink: boolean
}>) {
  const { projectReq } = useProjectRoute()
  const projectResult = useAtomValue(project(projectReq))
  const github = Result.isSuccess(projectResult)
    ? ticketRepo(projectResult.value, ticket.repoId)
    : null
  if (ticket.branch === null || github === null) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <GitBranch className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_branch()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        <BranchItems
          ticket={ticket}
          branch={ticket.branch}
          github={github}
          canStack={canStack}
          canUnlink={canUnlink}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function BranchItems({
  ticket,
  branch,
  github,
  canStack,
  canUnlink
}: Readonly<{
  ticket: BranchTicket
  branch: string
  github: GithubConnection
  canStack: boolean
  canUnlink: boolean
}>) {
  const { projectReq } = useProjectRoute()
  const repo = `${github.repoOwner}/${github.repoName}`
  const link = usePreferredBranchLink(repo, branch)
  const openPage = useOpenTicketPage(ticket.id)
  const registry = useContext(RegistryContext)
  return (
    <>
      <DropdownMenuItem
        render={<a {...link} aria-label={m.tickets_command_open_branch()} />}
        className="cursor-pointer"
      >
        <ArrowUpRight className="size-4" strokeWidth={1.75} />
        {m.tickets_command_open_branch()}
      </DropdownMenuItem>
      {ticket.pr !== null && (
        <DropdownMenuItem
          render={
            <a
              href={`${repoUrl(github)}/pull/${ticket.pr}`}
              target="_blank"
              rel="noreferrer"
              aria-label={m.tickets_command_open_pr()}
            />
          }
          className="cursor-pointer"
        >
          <GitPullRequest className="size-4" strokeWidth={1.75} />
          {m.tickets_command_open_pr()}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={() => void navigator.clipboard.writeText(branch)}
        className="cursor-pointer"
      >
        <Copy className="size-4" strokeWidth={1.75} />
        {m.tickets_command_copy_branch()}
      </DropdownMenuItem>
      {(canStack || canUnlink) && <DropdownMenuSeparator />}
      {canStack && (
        <DropdownMenuItem
          onClick={() => openPage("ticketStackBranch")}
          className="cursor-pointer"
        >
          <Layers className="size-4" strokeWidth={1.75} />
          {m.tickets_command_stack_branch()}
        </DropdownMenuItem>
      )}
      {canUnlink && (
        <DropdownMenuItem
          onClick={() =>
            void fireMutation(
              registry,
              clearBranch({ req: projectReq, id: ticket.id }),
              undefined
            )
          }
          className="cursor-pointer"
        >
          <Unlink className="size-4" strokeWidth={1.75} />
          {m.tickets_command_unlink_branch()}
        </DropdownMenuItem>
      )}
    </>
  )
}
