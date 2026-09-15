import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { Inbox, LogOut, MailCheck, UserRound } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { logout, me, setActiveOrganization } from "@/atoms/auth"
import {
  acceptInvitation,
  invitations,
  rejectInvitation
} from "@/atoms/invitations"
import { Button } from "@/components/ui/button"
import {
  OnboardingGateStatus,
  OnboardingShell
} from "@/components/OnboardingShell"
import { ErrorPage } from "@/components/ErrorPage"
import { errorMessage } from "@/lib/errorMessage"
import {
  invitationInviterDetail,
  invitationRoleLabel,
  pickActiveInvitation
} from "@/lib/invitations"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { UserInvitation } from "@projectproject/shared"

type AcceptInvitation = (input: void) => Promise<Exit.Exit<unknown, unknown>>

export const Route = createFileRoute("/welcome")({
  component: WelcomePage
})

function WelcomePage() {
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

function WelcomeInviteList({
  invites,
  onJoining
}: {
  invites: ReadonlyArray<UserInvitation>
  onJoining: (joining: boolean) => void
}) {
  const navigate = useNavigate({ from: Route.fullPath })
  const activateOrg = useAtomSet(setActiveOrganization, {
    mode: "promiseExit"
  })
  const signOut = useAtomSet(logout)
  const [pageError, setPageError] = useState<string | null>(null)
  const accepts = useRef(new Map<string, AcceptInvitation>())

  const registerAccept = useCallback(
    (invitationId: string, accept: AcceptInvitation) => {
      accepts.current.set(invitationId, accept)
      return () => {
        accepts.current.delete(invitationId)
      }
    },
    []
  )

  const enterOrg = useCallback(
    async (accepted: ReadonlyArray<UserInvitation>) => {
      const active = pickActiveInvitation(accepted)
      if (active && Exit.isSuccess(await activateOrg(active.orgSlug))) {
        await navigate({
          to: "/orgs/$orgSlug",
          params: { orgSlug: active.orgSlug },
          replace: true
        })
        return
      }
      setPageError(m.auth_invites_accept_all_error())
      onJoining(false)
    },
    [activateOrg, navigate, onJoining]
  )

  const onAcceptAll = async () => {
    setPageError(null)
    onJoining(true)
    const entries = [...accepts.current.entries()]
    const exits = await Promise.all(entries.map(([, accept]) => accept()))
    const acceptedIds = new Set(
      entries.flatMap(([invitationId], index) =>
        Exit.isSuccess(exits[index]) ? [invitationId] : []
      )
    )
    await enterOrg(invites.filter((invite) => acceptedIds.has(invite.id)))
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {m.auth_invites_title()}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {m.auth_invites_body()}
        </p>
      </div>
      <ul className="overflow-hidden rounded-xl border border-border bg-background">
        {invites.map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            registerAccept={registerAccept}
            onJoining={onJoining}
            onAccepted={enterOrg}
          />
        ))}
      </ul>
      {pageError ? (
        <p className="text-sm text-destructive">{pageError}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {invites.length > 1 ? (
          <Button type="button" leadingIcon={MailCheck} onClick={onAcceptAll}>
            {m.auth_invites_accept_all_button()}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="tertiary"
          leadingIcon={LogOut}
          onClick={() => signOut()}
        >
          {m.auth_welcome_sign_out_button()}
        </Button>
      </div>
    </div>
  )
}

function InviteRow({
  invite,
  registerAccept,
  onJoining,
  onAccepted
}: {
  invite: UserInvitation
  registerAccept: (invitationId: string, accept: AcceptInvitation) => () => void
  onJoining: (joining: boolean) => void
  onAccepted: (accepted: ReadonlyArray<UserInvitation>) => Promise<void>
}) {
  const mutationKey = { invitationId: invite.id }
  const accept = useAtomSet(acceptInvitation(mutationKey), {
    mode: "promiseExit"
  })
  const acceptState = useAtomValue(acceptInvitation(mutationKey))
  const reject = useAtomSet(rejectInvitation(mutationKey), {
    mode: "promiseExit"
  })
  const rejectState = useAtomValue(rejectInvitation(mutationKey))
  const accepting = acceptState.waiting
  const declining = rejectState.waiting
  const acceptError = Result.matchWithError(acceptState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) =>
      error._tag === "InvitationNotAcceptable"
        ? errorMessage(error)
        : m.auth_invites_accept_row_error(),
    onDefect: () => m.auth_invites_accept_row_error()
  })
  const declineFailed = Result.isFailure(rejectState)

  useEffect(
    () => registerAccept(invite.id, accept),
    [registerAccept, invite.id, accept]
  )

  const onAccept = async () => {
    onJoining(true)
    const exit = await accept()
    if (Exit.isFailure(exit)) {
      onJoining(false)
      return
    }
    await onAccepted([invite])
  }

  const initial = invite.orgName.trim().charAt(0).toUpperCase() || "·"

  return (
    <li
      className={cn(
        "group flex items-start gap-3 border-border border-b px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/30 sm:items-center sm:gap-4",
        (accepting || declining) && "animate-pulse"
      )}
    >
      <div
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border ring-inset"
      >
        <span className="font-mono text-[15px] font-medium leading-none text-foreground">
          {initial}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-medium leading-5 text-foreground">
            {invite.orgName}
          </span>
          <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-px text-[10.5px] font-medium capitalize leading-[1.5] text-muted-foreground">
            {invitationRoleLabel(invite.role)}
          </span>
        </div>
        <div className="truncate text-[12.5px] leading-5 text-muted-foreground">
          {invitationInviterDetail(invite.inviterEmail)}
        </div>
        {acceptError ? (
          <div className="pt-1 text-[12.5px] leading-5 text-destructive">
            {acceptError}
          </div>
        ) : null}
        {declineFailed ? (
          <div className="pt-1 text-[12.5px] leading-5 text-destructive">
            {m.auth_invites_decline_row_error()}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={declining || accepting}
          loading={declining}
          onClick={() => void reject()}
        >
          {m.auth_invites_decline_button()}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={accepting}
          disabled={declining || accepting}
          onClick={onAccept}
        >
          {m.auth_invites_accept_button()}
        </Button>
      </div>
    </li>
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
            className="flex items-center gap-4 border-border border-b px-4 py-3.5 last:border-b-0"
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
