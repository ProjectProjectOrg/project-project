import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@pp/ui/dropdown-menu"
import { ArrowRightLeft, FolderInput, Timer } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export function MoveToSubmenu({
  onSprint,
  onProject
}: Readonly<{ onSprint?: () => void; onProject?: () => void }>) {
  if (onSprint === undefined && onProject === undefined) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowRightLeft className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_move_to()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        {onSprint !== undefined && (
          <DropdownMenuItem onClick={onSprint} className="cursor-pointer">
            <Timer className="size-4" strokeWidth={1.75} />
            {m.tickets_menu_move_to_sprint()}
          </DropdownMenuItem>
        )}
        {onProject !== undefined && (
          <DropdownMenuItem onClick={onProject} className="cursor-pointer">
            <FolderInput className="size-4" strokeWidth={1.75} />
            {m.tickets_menu_move_to_project()}
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
