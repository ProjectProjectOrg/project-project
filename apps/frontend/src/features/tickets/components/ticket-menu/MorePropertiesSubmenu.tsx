import { useAtomValue } from "@effect/atom-react"
import { canHaveParent } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranch, GitMerge, Layers, Settings2 } from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { project } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

export function MorePropertiesSubmenu({
  ticket
}: Readonly<{
  ticket: Pick<TicketMenuTicket, "id" | "type" | "parent" | "branch">
}>) {
  const { projectReq } = useProjectRoute()
  const projectResult = useAtomValue(project(projectReq))
  const github = Result.isSuccess(projectResult)
    ? projectResult.value.github
    : null
  const openPage = useOpenTicketPage(ticket.id)
  const canEpic = canHaveParent(ticket.type)
  const canBranch = ticket.branch === null && github !== null
  if (!canEpic && !canBranch) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Settings2 className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_more_properties()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {canEpic && (
          <DropdownMenuItem
            onClick={() => openPage("ticketParent")}
            className="cursor-pointer"
          >
            <Layers className="size-4" strokeWidth={1.75} />
            {ticket.parent
              ? m.tickets_command_change_epic()
              : m.tickets_command_add_to_epic()}
          </DropdownMenuItem>
        )}
        {canBranch && (
          <>
            <DropdownMenuItem
              onClick={() => openPage("ticketBranch")}
              className="cursor-pointer"
            >
              <GitBranch className="size-4" strokeWidth={1.75} />
              {m.tickets_command_create_branch()}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openPage("ticketLinkBranch")}
              className="cursor-pointer"
            >
              <GitMerge className="size-4" strokeWidth={1.75} />
              {m.tickets_command_link_branch()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
