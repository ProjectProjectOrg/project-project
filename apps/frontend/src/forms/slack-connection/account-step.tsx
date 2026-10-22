import { SettingsGroup } from "@/components/settings/SettingsSection"
import { m } from "@/paraglide/messages"

import { CredentialRow } from "./credential-row"
import type { SlackConnectionFormApi } from "./index"
import { accountSchema, stepValidator } from "./opts"
import { SetupStep, type StepFrame } from "./setup-step"

export function AccountStep({
  form,
  frame,
  submitting,
  onBack
}: Readonly<{
  form: SlackConnectionFormApi
  frame: StepFrame
  submitting: boolean
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
        <SetupStep
          frame={frame}
          title={m.slack_setup_client_title()}
          description={m.slack_setup_client_body()}
          submitLabel={m.slack_connect()}
          submitting={submitting}
          onBack={onBack}
          onSubmit={() => void group.handleSubmit()}
        >
          <SettingsGroup>
            <group.Field name="clientId">
              {(field) => (
                <CredentialRow
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
                  busy={frame.busy}
                />
              )}
            </group.Field>
            <group.Field name="clientSecret">
              {(field) => (
                <CredentialRow
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
                  busy={frame.busy}
                />
              )}
            </group.Field>
          </SettingsGroup>
          <p className="px-0.5 text-xs text-muted-foreground">
            {m.slack_credential_notice()}
          </p>
        </SetupStep>
      )}
    </form.FormGroup>
  )
}
