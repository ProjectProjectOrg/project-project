import type { Ticket } from "@pp/shared"
import * as Exit from "effect/Exit"
import { Flag } from "lucide-react"
import type { KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Composer } from "@/components/ui/composer"
import { DialogTitle } from "@/components/ui/dialog"
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
  ticket: Pick<Ticket, "id" | "title">
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
      <Composer.Header className="text-body">
        <DialogTitle className="inline-flex h-8 items-center gap-1.5 px-2.5 font-normal text-foreground">
          <Flag className="size-3.5" strokeWidth={1.75} />
          {m.tickets_flag_heading()}
        </DialogTitle>
        <span className="text-muted-foreground tabular-nums">{ticket.id}</span>
      </Composer.Header>
      <Composer.Title className="mt-1 truncate">{ticket.title}</Composer.Title>
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
      <Composer.Hint className="px-4 pt-4">
        {m.tickets_flag_hint()}
      </Composer.Hint>
      <Composer.Error>{error}</Composer.Error>
      <Composer.Footer>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {m.common_cancel_button()}
        </Button>
        <Button type="submit" size="sm" disabled={waiting}>
          {m.tickets_flag_submit()}
        </Button>
      </Composer.Footer>
    </form>
  )
}
