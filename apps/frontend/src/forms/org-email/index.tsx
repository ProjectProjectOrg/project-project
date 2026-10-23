import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  OrgEmailError,
  Forbidden,
  NotFound,
  Unauthorized,
  type OrgEmailStatus
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useState } from "react"

import { SEGMENTED_ITEM_CLASS, SegmentedTabs } from "@/components/SegmentedTabs"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { SettingsInput } from "@/components/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  disconnectOrgEmail,
  emailRequest,
  saveOrgEmail,
  testOrgEmail
} from "@/features/organizations/atoms/email"
import { errorMessage, emailFailureMessage } from "@/lib/errorMessage"
import { useAppForm } from "@/lib/form"
import { cn } from "@/lib/utils"
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
  const disconnect = useAtomSet(disconnectOrgEmail(req), {
    mode: "promiseExit"
  })
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
  const textField = (
    name: "host" | "username" | "senderName" | "senderEmail",
    label: string,
    type: "text" | "email"
  ) => (
    <form.Field name={name}>
      {(field) => (
        <SettingsRow label={label}>
          <SettingsInput
            type={type}
            required
            value={field.value}
            disabled={busy}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            aria-invalid={field.errors.length > 0}
          />
        </SettingsRow>
      )}
    </form.Field>
  )

  return (
    <>
      <SettingsSection>
        <SettingsGroup>
          <form.Subscribe selector={(state) => state.isDirty}>
            {(dirty) => (
              <SettingsRow
                label={
                  <span
                    aria-live="polite"
                    className={cn(waiting && "animate-pulse")}
                  >
                    {!status.settings
                      ? m.org_email_not_configured()
                      : !status.lastTest
                        ? m.org_email_not_tested()
                        : status.lastTest.error
                          ? m.org_email_test_failed()
                          : m.org_email_test_accepted()}
                  </span>
                }
                description={
                  status.lastTest
                    ? m.org_email_last_test({
                        date: new Intl.DateTimeFormat(getLocale(), {
                          dateStyle: "medium",
                          timeStyle: "short"
                        }).format(status.lastTest.at)
                      })
                    : status.settings
                      ? dirty
                        ? m.org_email_save_before_test()
                        : m.org_email_test_hint()
                      : undefined
                }
                error={
                  status.lastTest?.error
                    ? emailFailureMessage(status.lastTest.error)
                    : null
                }
              >
                {status.settings ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    disabled={busy || dirty}
                    onClick={() => {
                      setLastAction("test")
                      void test()
                    }}
                  >
                    {m.org_email_test()}
                  </Button>
                ) : null}
              </SettingsRow>
            )}
          </form.Subscribe>
        </SettingsGroup>
      </SettingsSection>

      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void form.handleSubmit()
        }}
      >
        <SettingsSection title={m.org_email_section_server()}>
          <SettingsGroup>
            {textField("host", m.org_email_host(), "text")}
            <form.Field name="port">
              {(field) => (
                <SettingsRow label={m.org_email_port()}>
                  <SettingsInput
                    type="number"
                    min={1}
                    max={65535}
                    required
                    disabled={busy}
                    className="w-28"
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(event) =>
                      field.handleChange(event.target.valueAsNumber)
                    }
                  />
                </SettingsRow>
              )}
            </form.Field>
            <form.Field name="security">
              {(field) => (
                <SettingsRow label={m.org_email_security()}>
                  <fieldset disabled={busy}>
                    <SegmentedTabs
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
                </SettingsRow>
              )}
            </form.Field>
            {textField("username", m.org_email_username(), "text")}
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
                    <SettingsRow
                      label={m.org_email_password()}
                      description={{
                        new: m.org_email_password_hint,
                        reenter: m.org_email_password_reenter,
                        saved: m.org_email_password_saved
                      }[credential]()}
                    >
                      <SettingsInput
                        type="password"
                        autoComplete="new-password"
                        required={credential !== "saved"}
                        disabled={busy}
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.handleChange(event.target.value || undefined)
                        }
                      />
                    </SettingsRow>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={m.org_email_section_sender()}>
          <SettingsGroup>
            {textField("senderName", m.org_email_sender_name(), "text")}
            {textField("senderEmail", m.org_email_sender_email(), "email")}
            <form.Field name="replyTo">
              {(field) => (
                <SettingsRow label={m.org_email_reply_to()}>
                  <SettingsInput
                    type="email"
                    disabled={busy}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.handleChange(event.target.value || null)
                    }
                  />
                </SettingsRow>
              )}
            </form.Field>
          </SettingsGroup>
        </SettingsSection>

        <div className="flex items-center justify-end gap-3">
          <form.Subscribe selector={(state) => state.isValid}>
            {(valid) =>
              !valid && (
                <p role="alert" className="text-xs text-destructive">
                  {m.org_email_invalid()}
                </p>
              )
            }
          </form.Subscribe>
          {actionError && (
            <p role="alert" className="text-xs text-destructive">
              {actionError}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy}>
            {m.org_email_save()}
          </Button>
        </div>
      </form>

      {status.settings && (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow label={m.org_email_disconnect()}>
              <ConfirmButton.Root>
                <ConfirmButton.Trigger
                  variant="tertiary"
                  size="sm"
                  disabled={busy}
                >
                  {m.org_email_disconnect()}
                </ConfirmButton.Trigger>
                <ConfirmButton.Confirm>
                  <ConfirmButton.Action
                    prompt={m.org_email_disconnect_confirm()}
                    label={m.org_email_disconnect()}
                    onConfirm={async () => {
                      setLastAction("disconnect")
                      const exit = await disconnect()
                      if (Exit.isFailure(exit)) return false
                      form.reset(emailFormOpts.defaultValues)
                      return true
                    }}
                  />
                </ConfirmButton.Confirm>
              </ConfirmButton.Root>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      )}
    </>
  )
}
