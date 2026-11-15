import { useAtomSet } from "@effect/atom-react"
import { isEpic, type Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@pp/ui/context-menu"
import { DropdownMenuItem, DropdownMenuShortcut } from "@pp/ui/dropdown-menu"
import { ListPlus, Plus } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { keyLabels } from "@/lib/keyLabels"
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
            variant="ghost"
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
        <DropdownMenuItem onClick={onCreate}>
          <Plus className="size-4" strokeWidth={1.75} />
          {label}
          <DropdownMenuShortcut keys="c" keyLabels={keyLabels()} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={attachExisting}>
          <ListPlus className="size-4" strokeWidth={1.75} />
          {m.tickets_menu_attach_sub_ticket()}
        </DropdownMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
