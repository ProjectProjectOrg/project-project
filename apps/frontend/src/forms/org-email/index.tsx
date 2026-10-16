import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  OrgEmailError,
  Forbidden,
  NotFound,
  Unauthorized,
  type OrgEmailStatus
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"

import { SEGMENTED_ITEM_CLASS, SegmentedTabs } from "@/components/SegmentedTabs"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import { Input } from "@/components/ui/input"
import {
  disconnectOrgEmail,
  emailRequest,
  saveOrgEmail,
  testOrgEmail
} from "@/features/organizations/atoms/email"
import { errorMessage, emailFailureMessage } from "@/lib/errorMessage"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { emailFormOpts } from "./opts"

const isExpectedError = Schema.is(
  Schema.Union([OrgEmailError, Forbidden, NotFound, Unauthorized])
)

export function OrgEmailForm({
  orgSlug,
  status,
  waiting
}: Readonly<{ orgSlug: string; status: OrgEmailStatus; waiting: boolean }>) {
  const req = emailRequest(orgSlug)
  const save = useAtomSet(saveOrgEmail(req), { mode: "promiseExit" })
  const test = useAtomSet(testOrgEmail(req), { mode: "promiseExit" })
  const saveState = useAtomValue(saveOrgEmail(req))
  const testState = useAtomValue(testOrgEmail(req))
  const disconnectState = useAtomValue(disconnectOrgEmail(req))
  const busy =
    waiting || saveState.waiting || testState.waiting || disconnectState.waiting
  const [lastAction, setLastAction] = useState<
    "save" | "test" | "disconnect" | null
  >(null)
  const actionError =
    lastAction &&
    Result.matchWithError(
      { save: saveState, test: testState, disconnect: disconnectState }[
        lastAction
      ],
      {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) =>
          isExpectedError(error)
            ? errorMessage(error)
            : m.org_email_error_delivery(),
        onDefect: () => m.org_email_error_delivery()
      }
    )
  const form = useAppForm({
    ...emailFormOpts,
    defaultValues: { ...emailFormOpts.defaultValues, ...status.settings },
    onSubmit: async ({ value }) => {
      setLastAction("save")
      const result = await save(value)
      if (Exit.isSuccess(result)) form.reset({ ...value, password: undefined })
    }
  })
  const fields = [
    { name: "host", label: m.org_email_host(), type: "text" },
    { name: "username", label: m.org_email_username(), type: "text" },
    { name: "senderName", label: m.org_email_sender_name(), type: "text" },
    { name: "senderEmail", label: m.org_email_sender_email(), type: "email" }
  ] as const

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <div aria-live="polite" className={waiting ? "animate-pulse" : undefined}>
        <p className="text-sm font-medium">
          {!status.settings
            ? m.org_email_not_configured()
            : !status.lastTest
              ? m.org_email_not_tested()
              : status.lastTest.error
                ? m.org_email_test_failed()
                : m.org_email_test_accepted()}
        </p>
        {status.lastTest && (
          <p className="mt-1 text-xs text-muted-foreground">
            {m.org_email_last_test({
              date: new Intl.DateTimeFormat(getLocale(), {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(status.lastTest.at)
            })}
          </p>
        )}
        {status.lastTest?.error && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {emailFailureMessage(status.lastTest.error)}
          </p>
        )}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void form.handleSubmit()
        }}
      >
        {fields.map(({ name, label, type }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <div className="grid gap-2">
                <label
                  htmlFor={`email-${name}`}
                  className="text-sm font-medium"
                >
                  {label}
                </label>
                <Input
                  id={`email-${name}`}
                  type={type}
                  required
                  value={field.value}
                  disabled={busy}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.errors.length > 0}
                />
              </div>
            )}
          </form.Field>
        ))}
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="port">
            {(field) => (
              <div className="grid gap-2">
                <label htmlFor="email-port" className="text-sm font-medium">
                  {m.org_email_port()}
                </label>
                <Input
                  id="email-port"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  disabled={busy}
                  value={Number.isFinite(field.value) ? field.value : ""}
                  onChange={(event) =>
                    field.handleChange(event.target.valueAsNumber)
                  }
                />
              </div>
            )}
          </form.Field>
          <form.Field name="security">
            {(field) => (
              <fieldset disabled={busy} className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">
                  {m.org_email_security()}
                </legend>
                <SegmentedTabs
                  className="self-start"
                  items={[
                    { key: "starttls", label: m.org_email_starttls() },
                    { key: "tls", label: m.org_email_tls() }
                  ]}
                  isActive={(key) => key === field.value}
                  renderItem={(item, content, { active }) => (
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => field.handleChange(item.key)}
                      className={SEGMENTED_ITEM_CLASS(active)}
                    >
                      {content}
                    </button>
                  )}
                />
              </fieldset>
            )}
          </form.Field>
        </div>
        <form.Subscribe
          selector={({ values }) =>
            !status.settings
              ? "new"
              : values.host !== status.settings.host ||
                  values.port !== status.settings.port ||
                  values.username !== status.settings.username
                ? "reenter"
                : "saved"
          }
        >
          {(credential) => (
            <form.Field name="password">
              {(field) => (
                <div className="grid gap-2">
                  <label
                    htmlFor="email-password"
                    className="text-sm font-medium"
                  >
                    {m.org_email_password()}
                  </label>
                  <Input
                    id="email-password"
                    type="password"
                    autoComplete="new-password"
                    required={credential !== "saved"}
                    disabled={busy}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.handleChange(event.target.value || undefined)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {{
                      new: m.org_email_password_hint,
                      reenter: m.org_email_password_reenter,
                      saved: m.org_email_password_saved
                    }[credential]()}
                  </p>
                </div>
              )}
            </form.Field>
          )}
        </form.Subscribe>
        <form.Field name="replyTo">
          {(field) => (
            <div className="grid gap-2">
              <label htmlFor="email-reply-to" className="text-sm font-medium">
                {m.org_email_reply_to()}
              </label>
              <Input
                id="email-reply-to"
                type="email"
                disabled={busy}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.handleChange(event.target.value || null)
                }
              />
            </div>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isValid}>
          {(valid) =>
            !valid && (
              <p role="alert" className="text-sm text-destructive">
                {m.org_email_invalid()}
              </p>
            )
          }
        </form.Subscribe>
        <div>
          <Button type="submit" disabled={busy}>
            {m.org_email_save()}
          </Button>
        </div>
      </form>
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {status.settings && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {m.org_email_test_hint()}
          </p>
          <form.Subscribe selector={(state) => state.isDirty}>
            {(dirty) => (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={busy || dirty}
                  onClick={() => {
                    setLastAction("test")
                    void test()
                  }}
                >
                  {m.org_email_test()}
                </Button>
                {dirty && (
                  <span className="text-xs text-muted-foreground">
                    {m.org_email_save_before_test()}
                  </span>
                )}
              </div>
            )}
          </form.Subscribe>
          <ConfirmButton.Root className="justify-start">
            <ConfirmButton.Trigger variant="ghost" disabled={busy}>
              {m.org_email_disconnect()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <DisconnectEmail
                orgSlug={orgSlug}
                onStart={() => setLastAction("disconnect")}
                onDisconnected={() => form.reset(emailFormOpts.defaultValues)}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      )}
    </div>
  )
}

function DisconnectEmail({
  orgSlug,
  onStart,
  onDisconnected
}: Readonly<{
  orgSlug: string
  onStart: () => void
  onDisconnected: () => void
}>) {
  const disconnect = useAtomSet(disconnectOrgEmail(emailRequest(orgSlug)), {
    mode: "promiseExit"
  })
  const { close, busy, setBusy } = useConfirmButton()
  return (
    <>
      <span className="text-xs text-muted-foreground">
        {m.org_email_disconnect_confirm()}
      </span>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          onStart()
          const result = await disconnect()
          setBusy(false)
          if (Exit.isSuccess(result)) {
            onDisconnected()
            close()
          }
        }}
      >
        {m.org_email_disconnect()}
      </Button>
      <ConfirmButton.Cancel>{m.common_cancel_button()}</ConfirmButton.Cancel>
    </>
  )
}
