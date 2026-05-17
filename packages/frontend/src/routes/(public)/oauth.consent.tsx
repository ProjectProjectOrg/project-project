import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { useState, type ReactNode } from "react"
import { meAtom } from "@/atoms/auth"
import { submitConsentAtom } from "@/atoms/oauthConsent"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import { Logo, Wordmark } from "@/components/Logo"

type Search = {
  consent_code?: string
  client_id?: string
  scope?: string
}

export const Route = createFileRoute("/(public)/oauth/consent")({
  component: OauthConsentPage,
  validateSearch: (raw): Search => ({
    consent_code:
      typeof raw.consent_code === "string" ? raw.consent_code : undefined,
    client_id: typeof raw.client_id === "string" ? raw.client_id : undefined,
    scope: typeof raw.scope === "string" ? raw.scope : undefined
  })
})

function OauthConsentPage() {
  const me = useAtomValue(meAtom)
  const search = Route.useSearch()
  const { consent_code, client_id } = search

  if (Result.isFailure(me)) {
    return <Navigate to="/login" search={search} />
  }

  if (!consent_code) {
    return <ConsentShell title={m.auth_oauth_consent_title()} />
  }

  return <ConsentForm consentCode={consent_code} clientId={client_id} />
}

function ConsentForm({
  consentCode,
  clientId
}: {
  consentCode: string
  clientId: string | undefined
}) {
  const submit = useAtomSet(submitConsentAtom(consentCode), {
    mode: "promiseExit"
  })
  const submitState = useAtomValue(submitConsentAtom(consentCode))
  const [pending, setPending] = useState<"accept" | "deny" | null>(null)
  const error = Result.isFailure(submitState) ? m.error_unknown() : null

  const onSubmit = async (accept: boolean) => {
    setPending(accept ? "accept" : "deny")
    const exit = await submit({ accept, consentCode })
    if (Exit.isSuccess(exit)) {
      window.location.replace(exit.value.redirectURI)
      return
    }
    setPending(null)
  }

  const capabilities = [
    m.auth_oauth_consent_capability_read(),
    m.auth_oauth_consent_capability_write_tickets(),
    m.auth_oauth_consent_capability_write_comments(),
    m.auth_oauth_consent_capability_attach_branch()
  ]

  return (
    <ConsentShell title={m.auth_oauth_consent_title()}>
      <p className="text-sm text-muted-foreground">
        {m.auth_oauth_consent_subtitle({ client: clientId ?? "—" })}
      </p>
      <div className="flex w-full flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          {m.auth_oauth_consent_capabilities_heading()}
        </p>
        <ul className="w-full space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-foreground">
          {capabilities.map((label) => (
            <li key={label} className="flex items-start gap-2">
              <span aria-hidden className="mt-[5px] text-muted-foreground">
                ·
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full flex-col gap-2">
        <Button
          onClick={() => onSubmit(true)}
          disabled={pending !== null}
          size="lg"
          className="w-full"
        >
          {pending === "accept"
            ? m.auth_oauth_consent_accept_pending()
            : m.auth_oauth_consent_accept_button()}
        </Button>
        <Button
          variant="tertiary"
          onClick={() => onSubmit(false)}
          disabled={pending !== null}
          size="lg"
          className="w-full"
        >
          {pending === "deny"
            ? m.auth_oauth_consent_deny_pending()
            : m.auth_oauth_consent_deny_button()}
        </Button>
      </div>

      {error ? (
        <p className="text-center text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {m.auth_oauth_consent_footnote()}
        </p>
      )}
    </ConsentShell>
  )
}

function ConsentShell({
  title,
  children
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-foreground">
          <Logo className="size-12" />
          <Wordmark className="h-5 w-auto" />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-base font-medium text-foreground">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  )
}
