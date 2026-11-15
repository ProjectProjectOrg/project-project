import type { Ticket } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import * as Exit from "effect/Exit"
import { Flag } from "lucide-react"
import type { KeyboardEvent } from "react"

import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { flagTicketFormOpts } from "./opts"

export function FlagForm({
  ticket,
  onFlag,
  waiting,
  error,
  onClose
}: Readonly<{
  ticket: Readonly<{ id: Ticket["id"] | null; title: string }>
  onFlag: (reason: string) => Promise<Exit.Exit<unknown, unknown>>
  waiting: boolean
  error: string | null
  onClose: () => void
}>) {
  const form = useAppForm({
    ...flagTicketFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await onFlag(value.reason)
      if (Exit.isSuccess(exit)) onClose()
    }
  })
  const submit = () => {
    if (!waiting) void form.handleSubmit()
  }
  const submitOnModEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Composer.Header>
        <h2 className="inline-flex items-center gap-1.5 font-normal text-foreground">
          <Flag className="size-3.5" strokeWidth={1.75} />
          {m.tickets_flag_heading()}
        </h2>
        {ticket.id !== null && (
          <span className="tabular-nums">{ticket.id}</span>
        )}
      </Composer.Header>
      <Composer.Title className="truncate">{ticket.title}</Composer.Title>
      <form.Field name="reason">
        {(field) => (
          <Composer.Body onKeyDownCapture={submitOnModEnter}>
            <LexicalEditor
              markdown=""
              onDraftChange={field.handleChange}
              placeholder={m.tickets_flag_reason_placeholder()}
              autoFocus
            />
          </Composer.Body>
        )}
      </form.Field>
      <Composer.Error>{error}</Composer.Error>
      <Composer.Tray>
        <Composer.Footer>
          <Composer.Hint>{m.tickets_flag_hint()}</Composer.Hint>
          <Composer.Actions>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {m.common_cancel_button()}
            </Button>
            <Button type="submit" size="sm" disabled={waiting}>
              {m.tickets_flag_submit()}
            </Button>
          </Composer.Actions>
        </Composer.Footer>
      </Composer.Tray>
    </form>
  )
}
