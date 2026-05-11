import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { meAtom } from "@/atoms/auth"
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
  const { consent_code, client_id, scope } = Route.useSearch()
  const [submitting, setSubmitting] = useState<"accept" | "deny" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (Result.isFailure(me)) {
    const params = new URLSearchParams(window.location.search)
    return <Navigate to="/login" search={Object.fromEntries(params)} />
  }

  const scopes = (scope ?? "").split(/\s+/).filter(Boolean)

  async function submit(accept: boolean) {
    setSubmitting(accept ? "accept" : "deny")
    setError(null)
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, consent_code })
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const { redirectURI } = (await res.json()) as { redirectURI?: string }
      if (!redirectURI) throw new Error("missing redirectURI")
      window.location.replace(redirectURI)
    } catch (e) {
      setSubmitting(null)
      setError(m.error_unknown())
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-foreground">
          <Logo className="size-12" />
          <Wordmark className="h-5 w-auto" />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-base font-medium text-foreground">
            {m.auth_oauth_consent_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.auth_oauth_consent_subtitle({ client: client_id ?? "—" })}
          </p>
        </div>

        {scopes.length > 0 ? (
          <ul className="w-full space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-foreground">
            {scopes.map((s) => (
              <li key={s} className="flex items-center gap-2 font-mono">
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                {s}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex w-full flex-col gap-2">
          <Button
            onClick={() => submit(true)}
            disabled={submitting !== null || !consent_code}
            size="lg"
            className="w-full"
          >
            {submitting === "accept"
              ? m.auth_oauth_consent_accept_pending()
              : m.auth_oauth_consent_accept_button()}
          </Button>
          <Button
            variant="tertiary"
            onClick={() => submit(false)}
            disabled={submitting !== null || !consent_code}
            size="lg"
            className="w-full"
          >
            {submitting === "deny"
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
      </div>
    </main>
  )
}
