import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"

import { SettingsInput } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import {
  updateWebhook,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { replaceUrlFormOpts, toReplaceUrlInput } from "./opts"

type ReplaceUrlFormProps = Readonly<{
  target: Readonly<{ req: WebhooksRequest; id: string }>
  onDone: () => void
}>

export function ReplaceUrlForm({ target, onDone }: ReplaceUrlFormProps) {
  const update = useAtomSet(updateWebhook(target), { mode: "promiseExit" })
  const state = useAtomValue(updateWebhook(target))
  const form = useAppForm({
    ...replaceUrlFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await update(toReplaceUrlInput(value))
      if (Exit.isSuccess(exit)) onDone()
    }
  })
  const error = mutationErrorText(state)
  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex items-center gap-2">
        <form.Field name="url">
          {(field) => (
            <SettingsInput
              type="url"
              autoComplete="off"
              placeholder="https://"
              className="w-72 font-mono"
              value={field.value}
              disabled={state.waiting}
              aria-invalid={field.errors.length > 0}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={state.waiting}
          onClick={onDone}
        >
          {m.webhooks_edit_cancel()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={state.waiting}
        >
          {m.webhooks_edit_save()}
        </Button>
      </div>
      <form.Subscribe selector={(formState) => formState.errors.length > 0}>
        {(invalid) =>
          invalid || error ? (
            <p role="alert" className="text-xs text-destructive">
              {invalid ? m.webhooks_url_required() : error}
            </p>
          ) : null
        }
      </form.Subscribe>
    </form>
  )
}
