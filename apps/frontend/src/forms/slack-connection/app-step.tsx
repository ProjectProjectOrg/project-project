import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

import { CredentialInput } from "./credential-input"
import type { SlackConnectionFormApi } from "./index"
import { appSchema, stepValidator } from "./opts"

export function AppStep({
  form,
  busy,
  onBack,
  onNext
}: Readonly<{
  form: SlackConnectionFormApi
  busy: boolean
  onBack: () => void
  onNext: () => void
}>) {
  return (
    <form.FormGroup
      name="app"
      validators={[stepValidator(appSchema)]}
      onSubmit={onNext}
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
              {m.slack_setup_app_title()}
            </h3>
            <p className="text-sm text-muted-foreground">
              {m.slack_setup_app_body()}
            </p>
          </div>
          <group.Field name="token">
            {(field) => (
              <CredentialInput
                name="appToken"
                label={m.slack_app_token()}
                hint={m.slack_app_token_hint()}
                error={
                  field.errors.length ? m.slack_validation_app_token() : null
                }
                value={field.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                busy={busy}
              />
            )}
          </group.Field>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={busy}
            >
              {m.slack_setup_back()}
            </Button>
            <Button type="submit" disabled={busy}>
              {m.slack_setup_continue()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
