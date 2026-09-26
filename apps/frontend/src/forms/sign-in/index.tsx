import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Mail } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  sendMagicLink,
  sendSignInCode,
  signInWithCode
} from "@/features/auth/atoms/signIn"
import { signInErrorMessage } from "@/lib/errorMessage"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { signInFormOpts, type SignInMethod } from "./opts"

type SignInWithEmailProps = Readonly<{ callbackURL: string }>

const failureMessage = <A, E>(
  result: AsyncResult.AsyncResult<A, E>,
  fallback: string,
  toMessage: (error: E) => string
) =>
  AsyncResult.matchWithError(result, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: toMessage,
    onDefect: () => fallback
  })

export function SignInWithEmail({ callbackURL }: SignInWithEmailProps) {
  const sendLink = useAtomSet(sendMagicLink, { mode: "promiseExit" })
  const sendCode = useAtomSet(sendSignInCode, { mode: "promiseExit" })
  const verify = useAtomSet(signInWithCode, { mode: "promiseExit" })
  const linkState = useAtomValue(sendMagicLink)
  const codeState = useAtomValue(sendSignInCode)
  const verifyState = useAtomValue(signInWithCode)
  const [step, setStep] = useState<"email" | "code">("email")
  const sentTo = AsyncResult.isSuccess(codeState) ? codeState.value : ""
  const busy = linkState.waiting || codeState.waiting || verifyState.waiting

  const form = useAppForm({
    ...signInFormOpts,
    onSubmit: async ({ value }) => {
      if (step === "code") {
        const exit = await verify({ email: sentTo, otp: value.code })
        if (Exit.isSuccess(exit)) {
          window.location.replace(
            Option.getOrElse(exit.value, () => callbackURL)
          )
        }
        return
      }
      if (value.method === "code") {
        const exit = await sendCode(value.email)
        if (Exit.isSuccess(exit)) setStep("code")
        return
      }
      await sendLink({ email: value.email, callbackURL })
    }
  })

  const submitWith = (method: SignInMethod) => {
    form.setFieldValue("method", method)
  }

  const changeEmail = () => {
    form.setFieldValue("code", "")
    setStep("email")
  }

  if (step === "code") {
    const error =
      failureMessage(verifyState, m.auth_email_code_invalid(), (failure) =>
        signInErrorMessage(failure, m.auth_email_code_invalid())
      ) ??
      failureMessage(codeState, m.auth_email_code_send_error(), (failure) =>
        signInErrorMessage(failure, m.auth_email_code_send_error())
      )
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {m.auth_email_code_sent({ email: sentTo })}
        </p>
        <form.Field name="code">
          {(field) => (
            <Input
              value={field.value}
              onChange={(event) =>
                field.handleChange(
                  event.target.value.replace(/\D/g, "").slice(0, 6)
                )
              }
              onBlur={field.handleBlur}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={m.auth_email_code_placeholder()}
              aria-label={m.auth_email_code_label()}
              aria-describedby={error ? "sign-in-code-error" : undefined}
              aria-invalid={error !== null}
              required
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.code.length === 6}>
          {(complete) => (
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={verifyState.waiting}
              disabled={!complete || busy}
            >
              {m.auth_email_code_submit_button()}
            </Button>
          )}
        </form.Subscribe>
        <div className="flex justify-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void sendCode(sentTo)}
            loading={codeState.waiting}
            disabled={busy}
          >
            {m.auth_email_code_resend_button()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={changeEmail}
            disabled={busy}
          >
            {m.auth_email_code_change_email_button()}
          </Button>
        </div>
        {error ? (
          <p
            id="sign-in-code-error"
            role="alert"
            className="text-center text-xs leading-5 text-destructive"
          >
            {error}
          </p>
        ) : null}
      </form>
    )
  }

  const error =
    failureMessage(linkState, m.auth_magic_link_error(), (failure) =>
      signInErrorMessage(failure, m.auth_magic_link_error())
    ) ??
    failureMessage(codeState, m.auth_email_code_send_error(), (failure) =>
      signInErrorMessage(failure, m.auth_email_code_send_error())
    )

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <Input
            type="email"
            value={field.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            placeholder={m.auth_email_placeholder()}
            aria-label={m.auth_email_aria_label()}
            aria-describedby={error ? "sign-in-email-error" : undefined}
            required
          />
        )}
      </form.Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        leadingIcon={Mail}
        loading={linkState.waiting}
        disabled={busy}
        onClick={() => submitWith("link")}
      >
        {m.auth_continue_with_email_button()}
      </Button>
      <Button
        type="submit"
        variant="tertiary"
        size="lg"
        className="w-full"
        loading={codeState.waiting}
        disabled={busy}
        onClick={() => submitWith("code")}
      >
        {m.auth_email_code_button()}
      </Button>
      {AsyncResult.isSuccess(linkState) ? (
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {m.auth_magic_link_sent()}
        </p>
      ) : null}
      {error ? (
        <p
          id="sign-in-email-error"
          role="alert"
          className="text-center text-xs leading-5 text-destructive"
        >
          {error}
        </p>
      ) : null}
    </form>
  )
}
