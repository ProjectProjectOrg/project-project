import { useAtomValue } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { OauthShell } from "@/features/oauth/components/OauthShell"
import { m } from "@/paraglide/messages"

const failedRoute = getRouteApi("/(public)/cli/sign-in-failed")

export function CliSignedInPage() {
  const viewer = useAtomValue(me())

  return (
    <OauthShell title={m.auth_cli_signed_in_title()}>
      {Result.isSuccess(viewer) ? (
        <div className="flex w-full flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            {m.auth_cli_signed_in_as()}
          </p>
          <div className="flex w-full items-center gap-3 rounded-xl bg-background/60 p-3">
            <MemberAvatar member={viewer.value} size={32} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-foreground">
                {viewer.value.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {viewer.value.email}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">
        {m.auth_cli_signed_in_body()}
      </p>
    </OauthShell>
  )
}

export function CliSignInFailedPage() {
  const { reason } = failedRoute.useSearch()

  return (
    <OauthShell title={m.auth_cli_sign_in_failed_title()}>
      <p className="text-center text-sm text-muted-foreground">
        {reason === "access_denied"
          ? m.auth_cli_sign_in_failed_denied()
          : m.auth_cli_sign_in_failed_detail()}
      </p>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {m.auth_cli_sign_in_failed_retry()}
      </p>
    </OauthShell>
  )
}
