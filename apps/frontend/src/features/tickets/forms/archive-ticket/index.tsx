import type { ArchiveTicketInput, Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Archive, Ban, Clock, Copy } from "@pp/ui/icons"
import type { IconComponent } from "@pp/ui/lib/icon"
import * as Exit from "effect/Exit"
import { useId } from "react"

import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { archiveTicketFormOpts, toArchiveTicketInput } from "./opts"

export type ArchiveExit = Exit.Exit<unknown, unknown>
export type ArchiveTicket = Pick<Ticket, "id" | "title">

type ArchivePreset = Readonly<{ label: string; icon: IconComponent }>

const presets = () =>
  [
    { label: m.tickets_archive_preset_duplicate(), icon: Copy },
    { label: m.tickets_archive_preset_wont_do(), icon: Ban },
    { label: m.tickets_archive_preset_obsolete(), icon: Clock }
  ] satisfies ReadonlyArray<ArchivePreset>

const focusDetails = (field: HTMLTextAreaElement | null) => field?.focus()

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
  const headingId = useId()

  return (
    <form
      aria-labelledby={headingId}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Composer.Header>
        <h2
          id={headingId}
          className="inline-flex items-center gap-1.5 font-normal text-foreground"
        >
          <Archive className="size-3.5" strokeWidth={1.75} />
          {m.tickets_archive_heading()}
        </h2>
        <span className="tabular-nums">{ticket.id}</span>
      </Composer.Header>
      <Composer.Title className="truncate">{ticket.title}</Composer.Title>
      <Composer.Body>
        <form.Field name="details">
          {(field) => (
            <textarea
              ref={focusDetails}
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
      <Composer.Error>
        {failed ? m.tickets_archive_error_fallback() : null}
      </Composer.Error>
      <Composer.Tray>
        <Composer.Fields>
          <form.Field name="preset">
            {(field) =>
              presets().map(({ label, icon: Icon }) => (
                <Button
                  key={label}
                  type="button"
                  variant="ghost"
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
        </Composer.Fields>
        <Composer.Footer>
          <Composer.Hint>{m.tickets_archive_hint()}</Composer.Hint>
          <Composer.Actions>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {m.common_cancel_button()}
            </Button>
            <Button type="submit" size="sm" disabled={waiting}>
              {m.tickets_archive_submit()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}
