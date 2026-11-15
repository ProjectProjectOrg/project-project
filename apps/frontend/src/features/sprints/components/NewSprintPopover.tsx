import type { TicketId } from "@pp/shared"
import { Composer } from "@pp/ui/composer"
import { Popover, PopoverClose, PopoverTrigger } from "@pp/ui/popover"
import type { ReactElement } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { CreateSprintForm } from "@/features/sprints/forms/create-sprint"
import { m } from "@/paraglide/messages"

export function NewSprintPopover({
  trigger,
  open,
  onOpenChange,
  tickets
}: Readonly<{
  trigger: ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  tickets?: ReadonlyArray<TicketId>
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal="trap-focus">
      <PopoverTrigger render={trigger} />
      <Composer.Popover
        align="start"
        sideOffset={6}
        aria-label={m.sprints_create_dialog_title()}
      >
        <CreateSprintForm
          request={{ orgSlug, projectSlug: slug, tickets }}
          onDone={() => onOpenChange(false)}
        />
        <PopoverClose tabIndex={-1} className="sr-only">
          {m.common_close()}
        </PopoverClose>
      </Composer.Popover>
    </Popover>
  )
}
