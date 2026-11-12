import type { ArchiveTicketInput, Ticket } from "@pp/shared"
import * as Exit from "effect/Exit"
import { Archive, Ban, Clock, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Composer } from "@/components/ui/composer"
import { PopoverTitle } from "@/components/ui/popover"
import { useAppForm } from "@/lib/form"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

import { archiveTicketFormOpts, toArchiveTicketInput } from "./opts"

export type ArchiveExit = Exit.Exit<unknown, unknown>
export type ArchiveTicket = Pick<Ticket, "id" | "title">

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
  const form = useAppForm({
    ...archiveTicketFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await onArchive(toArchiveTicketInput(value))
      if (Exit.isSuccess(exit)) onClose()
    }
  })
  const submit = () => {
    if (!waiting) void form.handleSubmit()
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
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
      <Composer.Chips className="pl-2.5">
        <form.Field name="preset">
          {(field) =>
            presets().map(({ label, icon: Icon }) => (
              <Button
                key={label}
                type="button"
                variant="chip-toggle"
                size="sm"
                aria-pressed={field.value === label}
                onClick={() =>
                  field.handleChange(field.value === label ? null : label)
                }
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
                <span>{label}</span>
              </Button>
            ))
          }
        </form.Field>
      </Composer.Chips>
      <Composer.Body className="mt-3">
        <form.Field name="details">
          {(field) => (
            <textarea
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the popover
              autoFocus
              value={field.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
              aria-label={m.tickets_archive_details_placeholder()}
              placeholder={m.tickets_archive_details_placeholder()}
              className="block field-sizing-content min-h-32 w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
          )}
        </form.Field>
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
