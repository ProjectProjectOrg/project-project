import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackOrgStatus } from "@pp/shared"
import type { ReactFormType } from "@tanstack/react-form"
import * as Exit from "effect/Exit"
import { useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import {
  connectSlackOrg,
  disconnectSlackOrg,
  slackOrgRequest
} from "@/features/slack/atoms/slack"
import { useAppForm } from "@/lib/form"
import { mutationErrorText, slackActionErrorMessage } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AccountStep } from "./AccountStep"
import { AppStep } from "./AppStep"
import { BotStep } from "./BotStep"
import { CreateStep } from "./CreateStep"
import { slackConnectionOpts } from "./opts"
import type { StepFrame } from "./SetupStep"

export type SlackConnectionFormApi = ReactFormType<typeof slackConnectionOpts>
type SetupStep = "create" | "bot" | "app" | "account"

const draftFor = (clientId: string) => ({
  ...slackConnectionOpts.defaultValues,
  account: { ...slackConnectionOpts.defaultValues.account, clientId }
})

export function SlackConnectionForm({
  orgSlug,
  status
}: Readonly<{ orgSlug: string; status: SlackOrgStatus }>) {
  const req = slackOrgRequest(orgSlug)
  const save = useAtomSet(connectSlackOrg(req), { mode: "promiseExit" })
  const disconnect = useAtomSet(disconnectSlackOrg(req), {
    mode: "promiseExit"
  })
  const saveState = useAtomValue(connectSlackOrg(req))
  const disconnectState = useAtomValue(disconnectSlackOrg(req))
  const busy = saveState.waiting || disconnectState.waiting
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState<SetupStep>(
    status.connection ? "bot" : "create"
  )
  const steps: ReadonlyArray<SetupStep> = status.connection
    ? ["bot", "app", "account"]
    : ["create", "bot", "app", "account"]
  const form = useAppForm({
    ...slackConnectionOpts,
    defaultValues: draftFor(status.connection?.clientId ?? ""),
    onSubmit: async ({ value }) => {
      const result = await save({
        botToken: value.bot.token,
        appToken: value.app.token,
        ...value.account
      })
      if (Exit.isSuccess(result)) {
        form.reset(draftFor(value.account.clientId))
        setEditing(false)
      }
    }
  })
  const cancel = () => {
    form.reset(draftFor(status.connection?.clientId ?? ""))
    setEditing(false)
    setStep("bot")
  }
  const frame: StepFrame = {
    progress: m.slack_setup_progress({
      current: steps.indexOf(step) + 1,
      total: steps.length
    }),
    busy,
    error: mutationErrorText(saveState, slackActionErrorMessage),
    onCancel: status.connection ? cancel : undefined
  }

  return (
    <>
      {status.connection ? (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow
              icon={<IntegrationLogo kind="slack" />}
              label={status.connection.teamName}
              description={
                <span className={cn(busy && "animate-pulse")}>
                  {status.connection.lastError
                    ? m.slack_connection_attention()
                    : m.slack_workspace_connected()}
                </span>
              }
              error={
                status.connection.lastError === "credentials"
                  ? m.slack_error_credentials()
                  : status.connection.lastError
                    ? m.slack_error_socket()
                    : null
              }
            >
              {editing ? null : (
                <>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setStep("bot")
                      setEditing(true)
                    }}
                  >
                    {m.slack_replace()}
                  </Button>
                  <ConfirmButton.Root>
                    <ConfirmButton.Trigger
                      type="button"
                      variant="tertiary"
                      size="sm"
                      disabled={busy}
                    >
                      {m.slack_disconnect()}
                    </ConfirmButton.Trigger>
                    <ConfirmButton.Confirm>
                      <ConfirmButton.Action
                        prompt={m.slack_disconnect_confirm()}
                        label={m.slack_disconnect()}
                        onConfirm={async () => {
                          const exit = await disconnect()
                          if (Exit.isSuccess(exit)) {
                            form.reset(draftFor(""))
                            setStep("create")
                          }
                          return exit
                        }}
                      />
                    </ConfirmButton.Confirm>
                  </ConfirmButton.Root>
                </>
              )}
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
      {!status.connection || editing ? (
        <>
          {step === "create" ? (
            <CreateStep
              frame={frame}
              orgSlug={orgSlug}
              onNext={() => setStep("bot")}
            />
          ) : null}
          {step === "bot" ? (
            <BotStep
              form={form}
              frame={frame}
              onBack={status.connection ? undefined : () => setStep("create")}
              onNext={() => setStep("app")}
            />
          ) : null}
          {step === "app" ? (
            <AppStep
              form={form}
              frame={frame}
              onBack={() => setStep("bot")}
              onNext={() => setStep("account")}
            />
          ) : null}
          {step === "account" ? (
            <AccountStep
              form={form}
              frame={frame}
              submitting={saveState.waiting}
              onBack={() => setStep("app")}
            />
          ) : null}
        </>
      ) : null}
    </>
  )
}
