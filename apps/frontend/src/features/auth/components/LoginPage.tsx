import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Navigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useEffect, useRef, useState } from "react"

import { Logo, Wordmark } from "@/components/shell/Logo"
import { Button } from "@/components/ui/button"
import { Dither, type TimeWarpZone } from "@/components/ui/dither"
import { me, signInProviders } from "@/features/auth/atoms/auth"
import {
  GoogleMark,
  MicrosoftMark
} from "@/features/auth/components/ProviderMarks"
import { MagicLinkForm } from "@/features/auth/forms/magic-link"
import {
  signInErrorCallbackURL,
  signInOAuthErrorMessage
} from "@/features/auth/lib/oauthErrors"
import { safeInternalPath } from "@/features/auth/lib/safeRedirect"
import {
  hasSignedOAuthQuery,
  oauthAuthorizeUrl,
  rawQueryFromSearch
} from "@/features/oauth/lib/oauthQuery"
import { m } from "@/paraglide/messages"
import { authClient } from "@/services/AuthClient"

const routeApi = getRouteApi("/(public)/login")

const DITHER_TIME_WARP_ZONES: TimeWarpZone[] = [
  {
    anchor: { type: "fraction", x: 0.5, y: 0.5 },
    radius: 0.77,
    strength: 3,
    falloff: 4.85
  }
]

export function LoginPage() {
  const viewer = useAtomValue(me())
  const providersResult = useAtomValue(signInProviders)
  const providers = Result.isSuccess(providersResult)
    ? providersResult.value.providers
    : []
  const { redirect, error: oauthError } = routeApi.useSearch()
  const signedOauthQuery =
    typeof window === "undefined"
      ? ""
      : rawQueryFromSearch(window.location.search)
  const oauthAuthorizeTarget = hasSignedOAuthQuery(signedOauthQuery)
    ? oauthAuthorizeUrl(signedOauthQuery)
    : null
  const redirectTarget = safeInternalPath(redirect)
  const oauthContinuationTarget =
    oauthAuthorizeTarget ??
    (redirectTarget.startsWith("/oauth/consent?") ||
    redirectTarget.startsWith("/api/integrations/slack/oauth/start?")
      ? redirectTarget
      : null)
  const [providerError, setProviderError] = useState(() =>
    signInOAuthErrorMessage(oauthError)
  )
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (Result.isSuccess(viewer) && oauthContinuationTarget) {
      window.location.replace(oauthContinuationTarget)
    }
  }, [viewer, oauthContinuationTarget])

  if (Result.isSuccess(viewer)) {
    if (oauthContinuationTarget) return null
    return <Navigate to="/" href={redirectTarget} />
  }

  async function handleSocialSignIn(
    provider: "google" | "microsoft",
    errorMessage: () => string
  ) {
    setProviderError(null)
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: oauthContinuationTarget ?? redirectTarget,
        errorCallbackURL: signInErrorCallbackURL(window.location.search)
      })
      if (error) setProviderError(errorMessage())
    } catch {
      setProviderError(errorMessage())
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-6">
      <div className="pointer-events-none absolute inset-0">
        <Dither
          disableAnimation
          speed={0}
          octaves={7}
          frequency={2.2}
          amplitude={0.52}
          lacunarity={2.2}
          rotationAngle={0.5}
          warpStrength={1.32}
          contrast={0.2}
          bias={-0.07}
          pixelSize={3}
          ditherType="4x4"
          cardRef={cardRef}
          cardWellEnabled
          cardFalloff={80}
          cardCornerRadius={16}
          timeWarpZones={DITHER_TIME_WARP_ZONES}
        />
      </div>
      <div
        ref={cardRef}
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-[color-mix(in_oklch,var(--background)_45%,var(--muted)_55%)]"
      >
        <div className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-8 text-foreground">
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary corner-squircle">
            <Logo className="size-10" inverted />
          </div>
          <div className="relative flex flex-col items-center gap-4">
            <Wordmark className="h-5 w-auto" />
            <p className="text-body text-muted-foreground">
              {m.auth_tagline()}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 px-8 pb-8">
          <MagicLinkForm
            callbackURL={oauthContinuationTarget ?? redirectTarget}
            otherError={providerError}
            onSubmitStart={() => setProviderError(null)}
          />

          {providers.length > 0 && (
            <div className="flex items-center gap-3 text-micro text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>{m.auth_provider_divider()}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {providers.includes("google") && (
            <Button
              variant="tertiary"
              onClick={() =>
                handleSocialSignIn("google", m.auth_google_sign_in_error)
              }
              leadingIcon={GoogleMark}
              size="lg"
              className="w-full"
            >
              {m.auth_continue_with_google_button()}
            </Button>
          )}

          {providers.includes("microsoft") && (
            <Button
              variant="tertiary"
              onClick={() =>
                handleSocialSignIn("microsoft", m.auth_microsoft_sign_in_error)
              }
              leadingIcon={MicrosoftMark}
              size="lg"
              className="w-full"
            >
              {m.auth_continue_with_microsoft_button()}
            </Button>
          )}
        </div>

        <p className="px-8 pb-8 text-center text-micro leading-relaxed text-muted-foreground">
          {m.auth_consent_notice()}
        </p>
      </div>
    </main>
  )
}
