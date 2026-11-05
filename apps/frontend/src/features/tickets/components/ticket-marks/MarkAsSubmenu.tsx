import { useAtomSet } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Flag } from "lucide-react"
import { Fragment } from "react"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

import { MARK_KINDS } from "./markKinds"

export function MarkAsSubmenu({ ticketId }: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const setMenu = useAtomSet(commandMenuState)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Flag className="size-4" strokeWidth={1.75} />
        {m.tickets_mark_as()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {MARK_KINDS.map(({ kind, icon: Icon, label }) => (
          <Fragment key={kind}>
            {kind === "duplicateOf" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() =>
                setMenu(
                  openCommandMenu({ orgSlug, slug, ticketId }, `mark:${kind}`)
                )
              }
              className="cursor-pointer"
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label()}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
