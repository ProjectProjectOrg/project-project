import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackOrgStatus } from "@pp/shared"
import type { ReactFormType } from "@tanstack/react-form"
import * as Exit from "effect/Exit"
import { Check, TriangleAlert } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  connectSlackOrg,
  disconnectSlackOrg,
  slackOrgRequest
} from "@/features/slack/atoms/slack"
import { SlackActionError } from "@/features/slack/components/ActionError"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { AccountStep } from "./account-step"
import { AppStep } from "./app-step"
import { BotStep } from "./bot-step"
import { CreateStep } from "./create-step"
import { slackConnectionOpts } from "./opts"

export type SlackConnectionFormApi = ReactFormType<typeof slackConnectionOpts>
type SetupStep = "create" | "bot" | "app" | "account"

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
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState<SetupStep>(
    status.connection ? "bot" : "create"
  )
  const steps: ReadonlyArray<SetupStep> = status.connection
    ? ["bot", "app", "account"]
    : ["create", "bot", "app", "account"]
  const form = useAppForm({
    ...slackConnectionOpts,
    defaultValues: {
      ...slackConnectionOpts.defaultValues,
      account: {
        ...slackConnectionOpts.defaultValues.account,
        clientId: status.connection?.clientId ?? ""
      }
    },
    onSubmit: async ({ value }) => {
      const result = await save({
        botToken: value.bot.token,
        appToken: value.app.token,
        ...value.account
      })
      if (Exit.isSuccess(result)) {
        form.reset({
          ...slackConnectionOpts.defaultValues,
          account: {
            ...slackConnectionOpts.defaultValues.account,
            clientId: value.account.clientId
          }
        })
        setEditing(false)
      }
    }
  })
  const cancel = () => {
    form.reset({
      ...slackConnectionOpts.defaultValues,
      account: {
        ...slackConnectionOpts.defaultValues.account,
        clientId: status.connection?.clientId ?? ""
      }
    })
    setEditing(false)
    setStep(status.connection ? "bot" : "create")
  }
  return (
    <div className="flex flex-col gap-4">
      {status.connection ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className={busy ? "animate-pulse space-y-1" : "space-y-1"}>
            <h2 className="text-lg font-semibold">
              {status.connection.teamName}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {status.connection.lastError ? (
                <TriangleAlert className="size-3.5" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              {status.connection.lastError
                ? m.slack_connection_attention()
                : m.slack_workspace_connected()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setStep("bot")
                  setEditing(true)
                }}
              >
                {m.slack_replace()}
              </Button>
            ) : null}
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={cancel}
              >
                {m.common_cancel_button()}
              </Button>
            ) : null}
            {!confirm && !editing ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                {m.slack_disconnect()}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {status.connection?.lastError ? (
        <output className="text-sm text-muted-foreground">
          {m.slack_error_socket()}
        </output>
      ) : null}
      {!status.connection || editing ? (
        <div className="flex max-w-lg flex-col gap-4">
          <p
            className="font-mono text-xs text-muted-foreground"
            aria-live="polite"
          >
            {m.slack_setup_progress({
              current: steps.findIndex((item) => item === step) + 1,
              total: steps.length
            })}
          </p>
          {step === "create" ? (
            <CreateStep orgSlug={orgSlug} onNext={() => setStep("bot")} />
          ) : null}
          {step === "bot" ? (
            <BotStep
              form={form}
              busy={busy}
              onBack={status.connection ? undefined : () => setStep("create")}
              onNext={() => setStep("app")}
            />
          ) : null}
          {step === "app" ? (
            <AppStep
              form={form}
              busy={busy}
              onBack={() => setStep("bot")}
              onNext={() => setStep("account")}
            />
          ) : null}
          {step === "account" ? (
            <AccountStep
              form={form}
              busy={busy}
              onBack={() => setStep("app")}
            />
          ) : null}
          <SlackActionError result={saveState} />
        </div>
      ) : null}
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">{m.slack_disconnect_confirm()}</p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              const result = await disconnect()
              if (Exit.isSuccess(result)) setConfirm(false)
            }}
          >
            {m.slack_disconnect()}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {m.common_cancel_button()}
          </Button>
        </div>
      ) : null}
      <SlackActionError result={disconnectState} />
    </div>
  )
}
