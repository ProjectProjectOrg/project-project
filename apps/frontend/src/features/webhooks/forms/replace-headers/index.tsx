import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"

import { Button } from "@/components/ui/button"
import {
  updateWebhook,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { HeadersEditor } from "@/features/webhooks/components/HeadersEditor"
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { replaceHeadersFormOpts, toReplaceHeadersInput } from "./opts"

type ReplaceHeadersFormProps = Readonly<{
  target: Readonly<{ req: WebhooksRequest; id: string }>
  names: ReadonlyArray<string>
  onDone: () => void
}>

export function ReplaceHeadersForm({
  target,
  names,
  onDone
}: ReplaceHeadersFormProps) {
  const update = useAtomSet(updateWebhook(target), { mode: "promiseExit" })
  const state = useAtomValue(updateWebhook(target))
  const form = useAppForm({
    ...replaceHeadersFormOpts(names),
    onSubmit: async ({ value }) => {
      const exit = await update(toReplaceHeadersInput(value))
      if (Exit.isSuccess(exit)) onDone()
    }
  })
  const error = mutationErrorText(state)
  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="headers">
        {(field) => (
          <>
            <HeadersEditor
              headers={field.value}
              disabled={state.waiting}
              onChange={field.handleChange}
            />
            {field.errors.length > 0 || error ? (
              <p role="alert" className="text-xs text-destructive">
                {field.errors.length > 0 ? m.webhooks_headers_invalid() : error}
              </p>
            ) : null}
          </>
        )}
      </form.Field>
      <div className="flex justify-end gap-2">
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
    </form>
  )
}
