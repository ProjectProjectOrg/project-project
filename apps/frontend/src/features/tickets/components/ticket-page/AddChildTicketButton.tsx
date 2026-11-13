import { useAtomSet } from "@effect/atom-react"
import { isEpic, type Ticket } from "@pp/shared"
import { ListPlus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  DropdownMenuItem,
  DropdownMenuShortcut
} from "@/components/ui/dropdown-menu"
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Parent = Pick<Ticket, "id" | "type">

export function useAttachExistingTicket(parent: Parent): () => void {
  const { orgSlug, slug } = useProjectRoute()
  const setCommandMenu = useAtomSet(commandMenuState)
  return () =>
    setCommandMenu(
      openCommandMenu({ orgSlug, slug, ticketId: parent.id }, "ticketSubTicket")
    )
}

export function AddChildTicketButton({
  parent,
  onCreate,
  className
}: Readonly<{ parent: Parent; onCreate: () => void; className?: string }>) {
  const attachExisting = useAttachExistingTicket(parent)
  const label = isEpic(parent)
    ? m.tickets_children_add_ticket()
    : m.tickets_children_add_sub_ticket()
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Button
            type="button"
            variant="quiet"
            size="square-7"
            aria-label={label}
            aria-keyshortcuts="c"
            onClick={onCreate}
            className={cn("motion-safe:active:scale-100", className)}
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <DropdownMenuItem onClick={onCreate} className="cursor-pointer">
          <Plus className="size-4" strokeWidth={1.75} />
          {label}
          <DropdownMenuShortcut>C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={attachExisting} className="cursor-pointer">
          <ListPlus className="size-4" strokeWidth={1.75} />
          {m.tickets_menu_attach_sub_ticket()}
        </DropdownMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
