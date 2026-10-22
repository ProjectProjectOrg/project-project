import { SettingsGroup } from "@/components/settings/SettingsSection"
import { m } from "@/paraglide/messages"

import { CredentialRow } from "./credential-row"
import type { SlackConnectionFormApi } from "./index"
import { appSchema, stepValidator } from "./opts"
import { SetupStep, type StepFrame } from "./setup-step"

export function AppStep({
  form,
  frame,
  onBack,
  onNext
}: Readonly<{
  form: SlackConnectionFormApi
  frame: StepFrame
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
        <SetupStep
          frame={frame}
          title={m.slack_setup_app_title()}
          description={m.slack_setup_app_body()}
          onBack={onBack}
          onSubmit={() => void group.handleSubmit()}
        >
          <SettingsGroup>
            <group.Field name="token">
              {(field) => (
                <CredentialRow
                  name="appToken"
                  label={m.slack_app_token()}
                  hint={m.slack_app_token_hint()}
                  error={
                    field.errors.length ? m.slack_validation_app_token() : null
                  }
                  value={field.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  busy={frame.busy}
                />
              )}
            </group.Field>
          </SettingsGroup>
        </SetupStep>
      )}
    </form.FormGroup>
  )
}
