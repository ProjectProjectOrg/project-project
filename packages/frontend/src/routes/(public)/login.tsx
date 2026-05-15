import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { Mail } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { meAtom } from "@/atoms/auth"
import { Logo, Wordmark } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { DitherBackdrop } from "@/components/ui/button-dither"
import { Input } from "@/components/ui/input"
import { m } from "@/paraglide/messages"
import { authClient } from "@/services/AuthClient"

export const Route = createFileRoute("/(public)/login")({
  component: LoginPage
})

function LoginPage() {
  const me = useAtomValue(meAtom)
  const [email, setEmail] = useState("")
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkPending, setMagicLinkPending] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)

  if (Result.isSuccess(me)) return <Navigate to="/" />

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMagicLinkPending(true)
    setMagicLinkError(null)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/"
    })
    setMagicLinkPending(false)
    if (error) {
      setMagicLinkError(m.auth_magic_link_error())
      return
    }
    setMagicLinkSent(true)
  }

  async function handleGoogleSignIn() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/"
    })
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-6">
      <div className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklch,var(--background)_45%,var(--muted)_55%)] shadow-sm">
        <div className="relative flex flex-col items-center gap-4 px-8 pb-8 pt-10 text-foreground">
          <div className="absolute inset-x-0 top-0 h-20 opacity-45">
            <DitherBackdrop
              from="#807F7F"
              to="#FEFEFE"
              direction="r"
              stops={[0.08, 0.88]}
              matrix="4x4"
              pixelSize={3}
            />
          </div>
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
            <Logo className="size-10" />
          </div>
          <div className="relative flex flex-col items-center gap-4">
            <Wordmark className="h-5 w-auto" />
            <p className="text-sm text-muted-foreground">{m.auth_tagline()}</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 px-8 pb-8">
          <form
            className="flex flex-col gap-2"
            onSubmit={handleMagicLinkSubmit}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={m.auth_email_placeholder()}
              aria-label={m.auth_email_aria_label()}
              required
            />
            <Button
              type="submit"
              variant="dither"
              size="lg"
              className="w-full text-white"
              leadingIcon={Mail}
              loading={magicLinkPending}
              ditherFrom="#0a0a0a"
              ditherTo="#737373"
              ditherDirection="r"
            >
              {m.auth_continue_with_email_button()}
            </Button>
          </form>

          {magicLinkSent ? (
            <p className="text-center text-xs leading-5 text-muted-foreground">
              {m.auth_magic_link_sent()}
            </p>
          ) : null}
          {magicLinkError ? (
            <p className="text-center text-xs leading-5 text-destructive">
              {magicLinkError}
            </p>
          ) : null}

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{m.auth_provider_divider()}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="tertiary"
            onClick={handleGoogleSignIn}
            leadingIcon={GoogleMark}
            size="lg"
            className="w-full"
          >
            {m.auth_continue_with_google_button()}
          </Button>
        </div>

        <p className="px-8 pb-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          {m.auth_consent_notice()}
        </p>
      </div>
    </main>
  )
}

function GoogleMark({
  size = 16,
  className
}: {
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.05.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.06v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.89A6.01 6.01 0 0 1 6.1 12c0-.66.11-1.3.31-1.89v-2.6H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.35-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.96 3 14.7 2 12 2a10 10 0 0 0-8.94 5.51l3.35 2.6C7.2 7.75 9.4 5.99 12 5.99Z"
      />
    </svg>
  )
}
