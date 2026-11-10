import type { TicketId } from "@pp/shared"
import type { ReactElement } from "react"

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
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
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(32rem,calc(100vw-2rem))] p-0"
      >
        <CreateSprintForm
          request={{ orgSlug, projectSlug: slug, tickets }}
          Title={PopoverTitle}
          onDone={() => onOpenChange(false)}
        />
        <PopoverClose tabIndex={-1} className="sr-only">
          {m.common_close()}
        </PopoverClose>
      </PopoverContent>
    </Popover>
  )
}
