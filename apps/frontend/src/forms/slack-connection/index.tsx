import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackOrgStatus } from "@pp/shared"
import type { ReactFormType } from "@tanstack/react-form"
import * as Exit from "effect/Exit"
import { useState } from "react"

import { IntegrationLogo } from "@/components/settings/IntegrationLogo"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  connectSlackOrg,
  disconnectSlackOrg,
  slackOrgRequest
} from "@/features/slack/atoms/slack"
import { slackActionError } from "@/features/slack/components/actionError"
import { useAppForm } from "@/lib/form"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AccountStep } from "./account-step"
import { AppStep } from "./app-step"
import { BotStep } from "./bot-step"
import { CreateStep } from "./create-step"
import { slackConnectionOpts } from "./opts"
import type { StepFrame } from "./setup-step"

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
    error: slackActionError(saveState),
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
                status.connection.lastError ? m.slack_error_socket() : null
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
