import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendMagicLink } from "@/features/auth/atoms/auth"
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { magicLinkFormOpts } from "./opts"

export function MagicLinkForm({
  callbackURL,
  otherError,
  onSubmitStart
}: Readonly<{
  callbackURL: string
  otherError: string | null
  onSubmitStart: () => void
}>) {
  const send = useAtomSet(sendMagicLink, { mode: "promiseExit" })
  const state = useAtomValue(sendMagicLink)
  const sent = AsyncResult.isSuccess(state) && !state.waiting
  const error = state.waiting
    ? null
    : (otherError ??
      mutationErrorText(
        state,
        () => m.auth_magic_link_error(),
        m.auth_magic_link_error
      ))
  const form = useAppForm({
    ...magicLinkFormOpts,
    onSubmit: async ({ value }) => {
      onSubmitStart()
      await send({ email: value.email, callbackURL })
    }
  })

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!state.waiting) void form.handleSubmit()
        }}
      >
        <form.Field name="email">
          {(field) => (
            <>
              <Input
                type="email"
                value={field.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder={m.auth_email_placeholder()}
                aria-label={m.auth_email_aria_label()}
                aria-invalid={field.errors.length > 0}
                required
              />
              {field.errors.length > 0 ? (
                <p
                  role="alert"
                  className="text-center text-xs leading-5 text-destructive"
                >
                  {m.auth_email_invalid()}
                </p>
              ) : null}
            </>
          )}
        </form.Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          leadingIcon={Mail}
          loading={state.waiting}
        >
          {m.auth_continue_with_email_button()}
        </Button>
      </form>

      {sent ? (
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {m.auth_magic_link_sent()}
        </p>
      ) : null}
      {error ? (
        <p className="text-center text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}
