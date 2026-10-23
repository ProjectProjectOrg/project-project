import type { ArchiveTicketInput } from "@pp/shared"
import * as Exit from "effect/Exit"
import { Archive, ArchiveRestore } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { m } from "@/paraglide/messages"

type ArchiveExit = Exit.Exit<unknown, unknown>

export function ArchiveTicketControl({
  archived,
  onArchive,
  onUnarchive,
  waiting,
  failed
}: {
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
    <ArchivePopover onArchive={onArchive} waiting={waiting} failed={failed} />
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
  onArchive,
  waiting,
  failed
}: {
  onArchive: (input: ArchiveTicketInput) => Promise<ArchiveExit>
  waiting: boolean
  failed: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")

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
      <PopoverContent align="end" className="w-72">
        <ArchiveForm
          reason={reason}
          onReasonChange={setReason}
          onArchive={onArchive}
          waiting={waiting}
          failed={failed}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ArchiveForm({
  reason,
  onReasonChange,
  onArchive,
  waiting,
  failed,
  onClose
}: {
  reason: string
  onReasonChange: (reason: string) => void
  onArchive: (input: ArchiveTicketInput) => Promise<ArchiveExit>
  waiting: boolean
  failed: boolean
  onClose: () => void
}) {
  const submit = async () => {
    const trimmed = reason.trim()
    const exit = await onArchive({
      reason: trimmed.length > 0 ? trimmed : undefined
    })
    if (Exit.isSuccess(exit)) {
      onReasonChange("")
      onClose()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{m.tickets_archive_confirm()}</p>
        <p className="text-xs text-muted-foreground">
          {m.tickets_archive_description()}
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          {m.tickets_archive_reason_label()}
        </span>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={m.tickets_archive_reason_placeholder()}
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm ring-offset-background transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {failed && (
        <p className="text-xs text-destructive">
          {m.tickets_archive_error_fallback()}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {m.tickets_archive_cancel()}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={waiting}
          onClick={() => void submit()}
        >
          {m.tickets_archive_submit()}
        </Button>
      </div>
    </div>
  )
}
