import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { UserInvitation } from "@pp/shared"
import { Navigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Inbox, LogOut, UserRound } from "lucide-react"
import { useRef, useState } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import {
  OnboardingGateStatus,
  OnboardingShell
} from "@/components/shell/OnboardingShell"
import { Button } from "@/components/ui/button"
import { logout, me } from "@/features/auth/atoms/auth"
import { invitations } from "@/features/organizations/atoms/invitations"
import { WelcomeInviteList } from "@/features/organizations/components/WelcomeInviteList"
import { m } from "@/paraglide/messages"

export function WelcomePage() {
  const viewer = useAtomValue(me())

  return Result.matchWithError(viewer, {
    onInitial: () => (
      <OnboardingGateStatus>{m.chrome_loading()}</OnboardingGateStatus>
    ),
    onError: () => <Navigate to="/login" replace />,
    onDefect: (defect) => <ErrorPage error={defect} />,
    onSuccess: ({ value }) =>
      value.activeOrgSlug ? (
        <Navigate
          to="/orgs/$orgSlug"
          params={{ orgSlug: value.activeOrgSlug }}
          replace
        />
      ) : (
        <WelcomeContent />
      )
  })
}

function WelcomeContent() {
  const invites = useAtomValue(invitations())
  const [joining, setJoining] = useState(false)
  const lastOffered = useRef<ReadonlyArray<UserInvitation>>([])

  return (
    <OnboardingShell icon={Inbox}>
      {Result.match(invites, {
        onInitial: () => <WelcomeSkeleton />,
        onFailure: () => <WelcomeNoAccess />,
        onSuccess: ({ value }) => {
          if (value.length > 0) lastOffered.current = value
          const offered = joining ? lastOffered.current : value
          return offered.length > 0 ? (
            <WelcomeInviteList invites={offered} onJoining={setJoining} />
          ) : (
            <WelcomeNoAccess />
          )
        }
      })}
    </OnboardingShell>
  )
}

function WelcomeNoAccess() {
  const signOut = useAtomSet(logout)

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {m.auth_welcome_title()}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {m.auth_welcome_body()}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          leadingIcon={LogOut}
          onClick={() => signOut()}
        >
          {m.auth_welcome_sign_out_button()}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          leadingIcon={UserRound}
          onClick={() => signOut()}
        >
          {m.auth_welcome_try_another_account_button()}
        </Button>
      </div>
    </>
  )
}

function WelcomeSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-64 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
              <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
