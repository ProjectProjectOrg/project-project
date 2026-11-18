import type { Group, TicketId } from "@pp/shared"
import { Composer } from "@pp/ui/composer"
import { Popover, PopoverClose, PopoverTrigger } from "@pp/ui/popover"
import type { ReactElement, RefObject } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { CreateSprintForm } from "@/features/sprints/forms/create-sprint"
import { m } from "@/paraglide/messages"

// The new-sprint composer, from a button on the page: either its own
// trigger, or the button of a menu it was picked from (`anchor`), like
// "Complete into a new sprint".
export function NewSprintPopover({
  trigger,
  anchor,
  open,
  onOpenChange,
  tickets,
  completeFrom
}: Readonly<{
  trigger?: ReactElement
  anchor?: RefObject<HTMLElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  tickets?: ReadonlyArray<TicketId>
  completeFrom?: Group
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal="trap-focus">
      {trigger !== undefined && <PopoverTrigger render={trigger} />}
      <Composer.Popover
        anchor={anchor}
        align="start"
        sideOffset={6}
        aria-label={m.sprints_create_dialog_title()}
      >
        <CreateSprintForm
          request={{ orgSlug, projectSlug: slug, tickets, completeFrom }}
          onDone={() => onOpenChange(false)}
        />
        <PopoverClose tabIndex={-1} className="sr-only">
          {m.common_close()}
        </PopoverClose>
      </Composer.Popover>
    </Popover>
  )
}
