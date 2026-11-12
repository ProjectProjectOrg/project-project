import type { ArchiveTicketInput, Ticket } from "@pp/shared"
import * as Exit from "effect/Exit"
import { Archive, ArchiveRestore, Ban, Clock, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Composer } from "@/components/ui/composer"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
import { archiveReason } from "@/features/tickets/lib/archiveReason"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

type ArchiveExit = Exit.Exit<unknown, unknown>
type ArchiveTicket = Pick<Ticket, "id" | "title">

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

type ArchivePreset = Readonly<{ label: string; icon: IconComponent }>

const presets = (): ReadonlyArray<ArchivePreset> => [
  { label: m.tickets_archive_preset_duplicate(), icon: Copy },
  { label: m.tickets_archive_preset_wont_do(), icon: Ban },
  { label: m.tickets_archive_preset_obsolete(), icon: Clock }
]

export function ArchiveForm({
  ticket,
  onArchive,
  waiting,
  failed,
  onClose
}: {
  ticket: ArchiveTicket
  onArchive: (input: ArchiveTicketInput) => Promise<ArchiveExit>
  waiting: boolean
  failed: boolean
  onClose: () => void
}) {
  const [preset, setPreset] = useState<string | null>(null)
  const [details, setDetails] = useState("")

  const submit = async () => {
    if (waiting) return
    const exit = await onArchive({ reason: archiveReason(preset, details) })
    if (Exit.isSuccess(exit)) onClose()
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Composer.Header className="text-body">
        <PopoverTitle className="inline-flex h-8 items-center gap-1.5 px-2.5 font-normal text-foreground">
          <Archive className="size-3.5" strokeWidth={1.75} />
          {m.tickets_archive_heading()}
        </PopoverTitle>
        <span className="text-muted-foreground tabular-nums">{ticket.id}</span>
      </Composer.Header>
      <Composer.Title className="mt-1 truncate">{ticket.title}</Composer.Title>
      <Composer.Chips className="gap-0.5 pl-2.5">
        {presets().map(({ label, icon: Icon }) => (
          <Button
            key={label}
            type="button"
            variant="chip-toggle"
            size="compact"
            aria-pressed={preset === label}
            onClick={() => setPreset(preset === label ? null : label)}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{label}</span>
          </Button>
        ))}
      </Composer.Chips>
      <Composer.Body>
        <textarea
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the popover
          autoFocus
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
          aria-label={m.tickets_archive_details_placeholder()}
          placeholder={m.tickets_archive_details_placeholder()}
          className="block field-sizing-content min-h-32 w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
        />
      </Composer.Body>
      <Composer.Hint className="px-4 pt-4">
        {m.tickets_archive_hint()}
      </Composer.Hint>
      <Composer.Error>
        {failed ? m.tickets_archive_error_fallback() : null}
      </Composer.Error>
      <Composer.Footer>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {m.common_cancel_button()}
        </Button>
        <Button type="submit" size="sm" disabled={waiting}>
          {m.tickets_archive_submit()}
        </Button>
      </Composer.Footer>
    </form>
  )
}
