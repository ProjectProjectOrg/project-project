import type { ArchiveTicketInput } from "@pp/shared"
import { Archive, ArchiveRestore } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  ArchiveForm,
  type ArchiveExit,
  type ArchiveTicket
} from "@/features/tickets/forms/archive-ticket"
import { m } from "@/paraglide/messages"

export function ArchiveTicketControl({
  ticket,
  archived,
  onArchive,
  onUnarchive,
  waiting,
  failed
}: {
  ticket: ArchiveTicket
  archived: boolean
  onArchive: (input: ArchiveTicketInput) => Promise<ArchiveExit>
  onUnarchive: () => void
  waiting: boolean
  failed: boolean
}) {
  return archived ? (
    <UnarchiveButton
      onUnarchive={onUnarchive}
      waiting={waiting}
      failed={failed}
    />
  ) : (
    <ArchivePopover
      ticket={ticket}
      onArchive={onArchive}
      waiting={waiting}
      failed={failed}
    />
  )
}

function UnarchiveButton({
  onUnarchive,
  waiting,
  failed
}: {
  onUnarchive: () => void
  waiting: boolean
  failed: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={m.tickets_unarchive_action_aria_label()}
      title={
        failed
          ? m.tickets_unarchive_error_fallback()
          : m.tickets_unarchive_button()
      }
      disabled={waiting}
      onClick={() => onUnarchive()}
      className={
        failed
          ? "text-destructive hover:text-destructive"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      <ArchiveRestore strokeWidth={1.75} />
    </Button>
  )
}

function ArchivePopover({
  ticket,
  onArchive,
  waiting,
  failed
}: {
  ticket: ArchiveTicket
  onArchive: (input: ArchiveTicketInput) => Promise<ArchiveExit>
  waiting: boolean
  failed: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.tickets_archive_action_aria_label()}
            title={m.tickets_archive_action_aria_label()}
            className="text-muted-foreground hover:text-foreground"
          >
            <Archive strokeWidth={1.75} />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-[min(32rem,calc(100vw-2rem))] p-0"
      >
        <ArchiveForm
          ticket={ticket}
          onArchive={onArchive}
          waiting={waiting}
          failed={failed}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
