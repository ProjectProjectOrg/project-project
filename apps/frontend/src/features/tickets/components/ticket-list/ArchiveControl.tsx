import type { ArchiveTicketInput } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Archive, ArchiveRestore } from "@pp/ui/icons"
import { Popover, PopoverTrigger } from "@pp/ui/popover"
import { useState } from "react"

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
      tone={failed ? "error" : undefined}
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
          >
            <Archive strokeWidth={1.75} />
          </Button>
        }
      />
      <Composer.Popover align="end">
        <ArchiveForm
          ticket={ticket}
          onArchive={onArchive}
          waiting={waiting}
          failed={failed}
          onClose={() => setOpen(false)}
        />
      </Composer.Popover>
    </Popover>
  )
}
