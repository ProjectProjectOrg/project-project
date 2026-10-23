import { SettingsGroup } from "@/components/settings/SettingsSection"
import { m } from "@/paraglide/messages"

import { CredentialRow } from "./credential-row"
import type { SlackConnectionFormApi } from "./index"
import { botSchema, stepValidator } from "./opts"
import { SetupStep, type StepFrame } from "./setup-step"

export function BotStep({
  form,
  frame,
  onBack,
  onNext
}: Readonly<{
  form: SlackConnectionFormApi
  frame: StepFrame
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
        <SetupStep
          frame={frame}
          title={m.slack_setup_bot_title()}
          description={m.slack_setup_bot_body()}
          onBack={onBack}
          onSubmit={() => void group.handleSubmit()}
        >
          <SettingsGroup>
            <group.Field name="token">
              {(field) => (
                <CredentialRow
                  name="botToken"
                  label={m.slack_bot_token()}
                  hint={m.slack_bot_token_hint()}
                  error={
                    field.errors.length ? m.slack_validation_bot_token() : null
                  }
                  value={field.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  busy={frame.busy}
                />
              )}
            </group.Field>
          </SettingsGroup>
          <p className="px-0.5 text-xs text-muted-foreground">
            {m.slack_credential_types_notice()}
          </p>
        </SetupStep>
      )}
    </form.FormGroup>
  )
}
