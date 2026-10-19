import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

import { CredentialInput } from "./credential-input"
import type { SlackConnectionFormApi } from "./index"
import { botSchema, stepValidator } from "./opts"

export function BotStep({
  form,
  busy,
  onBack,
  onNext
}: Readonly<{
  form: SlackConnectionFormApi
  busy: boolean
  onBack: (() => void) | undefined
  onNext: () => void
}>) {
  return (
    <form.FormGroup
      name="bot"
      validators={[stepValidator(botSchema)]}
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
              {m.slack_setup_bot_title()}
            </h3>
            <p className="text-sm text-muted-foreground">
              {m.slack_setup_bot_body()}
            </p>
          </div>
          <group.Field name="token">
            {(field) => (
              <CredentialInput
                name="botToken"
                label={m.slack_bot_token()}
                hint={m.slack_bot_token_hint()}
                error={
                  field.errors.length ? m.slack_validation_bot_token() : null
                }
                value={field.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                busy={busy}
              />
            )}
          </group.Field>
          <p className="text-xs text-muted-foreground">
            {m.slack_credential_types_notice()}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            {onBack ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={busy}
              >
                {m.slack_setup_back()}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={busy}>
              {m.slack_setup_continue()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
