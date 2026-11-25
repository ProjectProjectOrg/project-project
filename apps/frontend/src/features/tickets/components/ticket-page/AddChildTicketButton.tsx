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
import { ShortcutTooltip } from "@pp/ui/tooltip"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

type Parent = Pick<Ticket, "id" | "type">

export function useAttachExistingTicket(parent: Parent) {
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
  shortcutEnabled,
  className
}: Readonly<{
  parent: Parent
  onCreate: () => void
  shortcutEnabled: boolean
  className?: string
}>) {
  const attachExisting = useAttachExistingTicket(parent)
  const label = isEpic(parent)
    ? m.tickets_children_add_ticket()
    : m.tickets_children_add_sub_ticket()
  const shortcut = appHotkeys["tickets.add-sub-ticket"]
  const trigger = (
    <ContextMenuTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="square-7"
          aria-label={label}
          aria-keyshortcuts={
            shortcutEnabled ? shortcut.defaultHotkey : undefined
          }
          onClick={onCreate}
          className={cn("motion-safe:active:scale-100", className)}
        />
      }
    >
      <Plus className="size-4" strokeWidth={1.75} />
    </ContextMenuTrigger>
  )
  return (
    <ContextMenu>
      {shortcutEnabled ? (
        <ShortcutTooltip
          hotkey={shortcut}
          label={label}
          keyLabels={keyLabels()}
        >
          {trigger}
        </ShortcutTooltip>
      ) : (
        trigger
      )}
      <ContextMenuContent className="w-56">
        <DropdownMenuItem onClick={onCreate}>
          <Plus className="size-4" strokeWidth={1.75} />
          {label}
          {shortcutEnabled && (
            <DropdownMenuShortcut
              keys={shortcut.defaultHotkey}
              keyLabels={keyLabels()}
            />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={attachExisting}>
          <ListPlus className="size-4" strokeWidth={1.75} />
          {m.tickets_menu_attach_sub_ticket()}
        </DropdownMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
