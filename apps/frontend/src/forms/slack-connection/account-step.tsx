import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

import { CredentialInput } from "./credential-input"
import type { SlackConnectionFormApi } from "./index"
import { accountSchema, stepValidator } from "./opts"

export function AccountStep({
  form,
  busy,
  onBack
}: Readonly<{
  form: SlackConnectionFormApi
  busy: boolean
  onBack: () => void
}>) {
  return (
    <form.FormGroup
      name="account"
      validators={[stepValidator(accountSchema)]}
      onSubmit={async () => {
        await form.handleSubmit()
      }}
    >
      {(group) => (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) void group.handleSubmit()
          }}
        >
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {m.slack_setup_client_title()}
            </h3>
            <p className="text-sm text-muted-foreground">
              {m.slack_setup_client_body()}
            </p>
          </div>
          <group.Field name="clientId">
            {(field) => (
              <CredentialInput
                name="clientId"
                type="text"
                label={m.slack_client_id()}
                hint={m.slack_client_id_hint()}
                error={
                  field.errors.length ? m.slack_validation_client_id() : null
                }
                value={field.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                busy={busy}
              />
            )}
          </group.Field>
          <group.Field name="clientSecret">
            {(field) => (
              <CredentialInput
                name="clientSecret"
                label={m.slack_client_secret()}
                hint={m.slack_client_secret_hint()}
                error={
                  field.errors.length
                    ? m.slack_validation_client_secret()
                    : null
                }
                value={field.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                busy={busy}
              />
            )}
          </group.Field>
          <p className="text-xs text-muted-foreground">
            {m.slack_credential_notice()}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={busy}
            >
              {m.slack_setup_back()}
            </Button>
            <Button type="submit" disabled={busy} loading={busy}>
              {m.slack_connect()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
