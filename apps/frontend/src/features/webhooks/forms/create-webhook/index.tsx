import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsInput } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import {
  createWebhook,
  type WebhooksRequest
} from "@/features/webhooks/atoms/webhooks"
import { EventSwitches } from "@/features/webhooks/components/EventSwitches"
import { HeadersEditor } from "@/features/webhooks/components/HeadersEditor"
import { toggleEvent } from "@/features/webhooks/lib/webhookEvents"
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { createWebhookFormOpts, toCreateWebhookInput } from "./opts"

type CreateWebhookFormProps = Readonly<{
  req: WebhooksRequest
  onCreated: (created: Readonly<{ id: string; secret: string }>) => void
  onCancel: () => void
}>

export function CreateWebhookForm({
  req,
  onCreated,
  onCancel
}: CreateWebhookFormProps) {
  const create = useAtomSet(createWebhook(req), { mode: "promiseExit" })
  const state = useAtomValue(createWebhook(req))
  const form = useAppForm({
    ...createWebhookFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await create(toCreateWebhookInput(value))
      if (Exit.isSuccess(exit))
        onCreated({ id: exit.value.webhook.id, secret: exit.value.secret })
    }
  })
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <SettingsSection
        title={m.webhooks_create_title()}
        description={m.webhooks_create_description()}
      >
        <SettingsGroup>
          <form.Field name="url">
            {(field) => (
              <SettingsRow
                label={m.webhooks_url_label()}
                description={m.webhooks_url_hint()}
                error={
                  field.errors.length > 0
                    ? m.webhooks_url_required()
                    : mutationErrorText(state)
                }
              >
                <SettingsInput
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://"
                  className="w-80 font-mono"
                  value={field.value}
                  disabled={state.waiting}
                  aria-invalid={field.errors.length > 0}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </SettingsRow>
            )}
          </form.Field>
          <form.Field name="headers">
            {(field) => (
              <SettingsRow
                layout="stacked"
                label={m.webhooks_headers_label()}
                description={m.webhooks_headers_hint()}
                error={
                  field.errors.length > 0 ? m.webhooks_headers_invalid() : null
                }
              >
                <HeadersEditor
                  headers={field.value}
                  disabled={state.waiting}
                  onChange={field.handleChange}
                />
              </SettingsRow>
            )}
          </form.Field>
        </SettingsGroup>
      </SettingsSection>
      <form.Field name="events">
        {(field) => (
          <EventSwitches
            events={field.value}
            disabled={state.waiting}
            onToggle={(kind, on) =>
              field.handleChange(toggleEvent(field.value, kind, on))
            }
          />
        )}
      </form.Field>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={state.waiting}
          onClick={onCancel}
        >
          {m.webhooks_create_cancel()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={state.waiting}
        >
          {m.webhooks_create_submit()}
        </Button>
      </div>
    </form>
  )
}
