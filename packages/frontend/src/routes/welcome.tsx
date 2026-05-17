import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { Inbox, LogOut, MailCheck, UserRound } from "lucide-react"
import { useState, type ReactNode } from "react"
import {
  acceptInvitesAtom,
  declineInvitationAtom,
  logoutAtom,
  meAtom,
  pendingInvitesAtom
} from "@/atoms/auth"
import { Button } from "@/components/ui/button"
import { DitherBackdrop } from "@/components/ui/button-dither"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { InviteAcceptFailure, PendingInvite } from "@/lib/invitations"

type AcceptingTarget = { type: "all" } | { type: "invite"; id: string } | null

export const Route = createFileRoute("/welcome")({
  component: WelcomePage
})

function WelcomePage() {
  const me = useAtomValue(meAtom)

  return Result.matchWithError(me, {
    onInitial: () => (
      <WelcomeGateStatus>{m.chrome_loading()}</WelcomeGateStatus>
    ),
    onError: () => <Navigate to="/login" replace />,
    onDefect: (defect) => (
      <WelcomeGateStatus>
        {m.chrome_defect({ defect: String(defect) })}
      </WelcomeGateStatus>
    ),
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
  const invites = useAtomValue(pendingInvitesAtom)

  return (
    <WelcomeShell>
      {Result.match(invites, {
        onInitial: () => <WelcomeSkeleton />,
        onFailure: () => <WelcomeNoAccess />,
        onSuccess: ({ value, waiting }) =>
          value.length > 0 ? (
            <WelcomeInviteList invites={value} syncing={waiting} />
          ) : (
            <WelcomeNoAccess />
          )
      })}
    </WelcomeShell>
  )
}

function WelcomeGateStatus({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      {children}
    </main>
  )
}

function WelcomeShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center gap-6">
      <div className="relative h-28 overflow-hidden rounded-2xl border border-border bg-background">
        <DitherBackdrop
          from="var(--background)"
          to="var(--muted-foreground)"
          direction="tr"
          stops={[0.16, 0.92]}
          matrix="8x8"
          pixelSize={4}
        />
        <div className="absolute bottom-4 left-4 flex size-11 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
          <Inbox className="size-5 text-foreground" strokeWidth={1.75} />
        </div>
      </div>
      {children}
    </div>
  )
}

function WelcomeNoAccess() {
  const logout = useAtomSet(logoutAtom)

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
          onClick={() => logout()}
        >
          {m.auth_welcome_sign_out_button()}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          leadingIcon={UserRound}
          onClick={() => logout()}
        >
          {m.auth_welcome_try_another_account_button()}
        </Button>
      </div>
    </>
  )
}

function WelcomeInviteList({
  invites,
  syncing
}: {
  invites: readonly PendingInvite[]
  syncing: boolean
}) {
  const navigate = useNavigate({ from: Route.fullPath })
  const acceptAll = useAtomSet(acceptInvitesAtom, { mode: "promiseExit" })
  const acceptState = useAtomValue(acceptInvitesAtom)
  const logout = useAtomSet(logoutAtom)
  const [failedAccepts, setFailedAccepts] = useState<InviteAcceptFailure[]>([])
  const [acceptAllFailed, setAcceptAllFailed] = useState(false)
  const [acceptingTarget, setAcceptingTarget] = useState<AcceptingTarget>(null)
  const failedById = new Map(
    failedAccepts.map((failure) => [failure.invite.id, failure])
  )
  const accepting = acceptState.waiting
  const pageError =
    Result.isFailure(acceptState) || acceptAllFailed
      ? m.auth_invites_accept_all_error()
      : null

  const onAcceptAll = async () => {
    setAcceptingTarget({ type: "all" })
    setFailedAccepts([])
    setAcceptAllFailed(false)
    const exit = await acceptAll(invites)
    if (Exit.isFailure(exit)) {
      setAcceptingTarget(null)
      return
    }
    setFailedAccepts(exit.value.failures)
    setAcceptAllFailed(exit.value.failures.length === invites.length)
    setAcceptingTarget(null)
    if (exit.value.activeInvite) {
      await navigate({
        to: "/orgs/$orgSlug",
        params: { orgSlug: exit.value.activeInvite.organizationSlug },
        replace: true
      })
    }
  }

  const onAcceptInvite = async (invite: PendingInvite) => {
    setAcceptingTarget({ type: "invite", id: invite.id })
    setAcceptAllFailed(false)
    setFailedAccepts((failures) =>
      failures.filter((failure) => failure.invite.id !== invite.id)
    )
    const exit = await acceptAll([invite])
    setAcceptingTarget(null)
    if (Exit.isFailure(exit)) return
    setFailedAccepts((failures) => [
      ...failures.filter((failure) => failure.invite.id !== invite.id),
      ...exit.value.failures
    ])
    if (exit.value.activeInvite) {
      await navigate({
        to: "/orgs/$orgSlug",
        params: { orgSlug: exit.value.activeInvite.organizationSlug },
        replace: true
      })
    }
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
      <ul
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background",
          syncing && "animate-pulse"
        )}
      >
        {invites.map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            acceptFailure={failedById.get(invite.id)}
            accepting={accepting}
            acceptingInvite={
              acceptingTarget?.type === "invite" &&
              acceptingTarget.id === invite.id
            }
            onAccept={() => onAcceptInvite(invite)}
          />
        ))}
      </ul>
      {pageError ? (
        <p className="text-sm text-destructive">{pageError}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {invites.length > 1 ? (
          <Button
            type="button"
            leadingIcon={MailCheck}
            loading={accepting && acceptingTarget?.type === "all"}
            disabled={accepting}
            onClick={onAcceptAll}
          >
            {m.auth_invites_accept_all_button()}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="tertiary"
          leadingIcon={LogOut}
          onClick={() => logout()}
        >
          {m.auth_welcome_sign_out_button()}
        </Button>
      </div>
    </div>
  )
}

function InviteRow({
  invite,
  acceptFailure,
  accepting,
  acceptingInvite,
  onAccept
}: {
  invite: PendingInvite
  acceptFailure: InviteAcceptFailure | undefined
  accepting: boolean
  acceptingInvite: boolean
  onAccept: () => void
}) {
  const decline = useAtomSet(declineInvitationAtom(invite.id), {
    mode: "promiseExit"
  })
  const declineState = useAtomValue(declineInvitationAtom(invite.id))
  const [declineError, setDeclineError] = useState(false)
  const declining = declineState.waiting

  const onDecline = async () => {
    setDeclineError(false)
    const exit = await decline()
    if (Exit.isFailure(exit)) setDeclineError(true)
  }

  const initial = invite.organizationName.trim().charAt(0).toUpperCase() || "·"

  return (
    <li
      className={cn(
        "group flex items-start gap-3 border-border border-b px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/30 sm:items-center sm:gap-4",
        declining && "animate-pulse"
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
            {invite.organizationName}
          </span>
          <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-px text-[10.5px] font-medium capitalize leading-[1.5] text-muted-foreground">
            {roleLabel(invite.role)}
          </span>
        </div>
        <div className="truncate text-[12.5px] leading-5 text-muted-foreground">
          {m.auth_invites_row_detail({ inviter: invite.inviterEmail })}
        </div>
        {acceptFailure ? (
          <div className="pt-1 text-[12.5px] leading-5 text-destructive">
            {errorMessage(acceptFailure.error)}
          </div>
        ) : null}
        {declineError ? (
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
          onClick={onDecline}
        >
          {m.auth_invites_decline_button()}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={acceptingInvite}
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

function roleLabel(role: string) {
  if (role === "owner") return m.auth_invites_role_owner()
  if (role === "admin") return m.auth_invites_role_admin()
  return m.auth_invites_role_member()
}
