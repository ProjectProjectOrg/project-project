import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { UserInvitation } from "@pp/shared"
import {
  createFileRoute,
  Link,
  Navigate,
  useNavigate
} from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { LogOut, MailCheck } from "lucide-react"
import { useRef, useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  OnboardingGateStatus,
  OnboardingShell
} from "@/components/OnboardingShell"
import { Button } from "@/components/ui/button"
import { logout, me, setActiveOrganization } from "@/features/auth/atoms/auth"
import {
  acceptInvitation,
  invitations,
  rejectInvitation
} from "@/features/organizations/atoms/invitations"
import { errorMessage } from "@/lib/errorMessage"
import { invitationInviterDetail, invitationRoleLabel } from "@/lib/invitations"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/invite/$invitationId")({
  component: InvitePage
})

function InvitePage() {
  const { invitationId } = Route.useParams()
  const viewer = useAtomValue(me())

  return Result.matchWithError(viewer, {
    onInitial: () => (
      <OnboardingGateStatus>{m.chrome_loading()}</OnboardingGateStatus>
    ),
    onError: () => (
      <Navigate
        to="/login"
        search={{ redirect: `/invite/${invitationId}` }}
        replace
      />
    ),
    onDefect: (defect) => <ErrorPage error={defect} />,
    onSuccess: () => <InviteResolver invitationId={invitationId} />
  })
}

function InviteResolver({ invitationId }: { invitationId: string }) {
  const pending = useAtomValue(invitations())
  const resolved = useRef<UserInvitation | null>(null)

  return Result.matchWithError(pending, {
    onInitial: () => (
      <OnboardingShell icon={MailCheck}>
        <InviteSkeleton />
      </OnboardingShell>
    ),
    onError: () => (
      <OnboardingShell icon={MailCheck}>
        <InviteUnavailable />
      </OnboardingShell>
    ),
    onDefect: (defect) => <ErrorPage error={defect} />,
    onSuccess: ({ value }) => {
      const invite =
        value.find((invitation) => invitation.id === invitationId) ??
        resolved.current
      resolved.current = invite
      return (
        <OnboardingShell icon={MailCheck}>
          {invite ? <InviteAccept invite={invite} /> : <InviteUnavailable />}
        </OnboardingShell>
      )
    }
  })
}

function InviteAccept({ invite }: { invite: UserInvitation }) {
  const navigate = useNavigate()
  const mutationKey = { invitationId: invite.id }
  const accept = useAtomSet(acceptInvitation(mutationKey), {
    mode: "promiseExit"
  })
  const acceptState = useAtomValue(acceptInvitation(mutationKey))
  const decline = useAtomSet(rejectInvitation(mutationKey), {
    mode: "promiseExit"
  })
  const declineState = useAtomValue(rejectInvitation(mutationKey))
  const activateOrg = useAtomSet(setActiveOrganization, {
    mode: "promiseExit"
  })
  const [pending, setPending] = useState<"accept" | "decline" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accepting = acceptState.waiting || pending === "accept"
  const declining = declineState.waiting || pending === "decline"
  const busy = accepting || declining
  const acceptError = Result.matchWithError(acceptState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) =>
      error._tag === "InvitationNotAcceptable"
        ? errorMessage(error)
        : m.auth_invite_accept_error(),
    onDefect: () => m.auth_invite_accept_error()
  })

  const onAccept = async () => {
    setError(null)
    setPending("accept")
    try {
      const acceptExit = await accept()
      if (Exit.isFailure(acceptExit)) return
      const activeExit = await activateOrg(invite.orgSlug)
      if (Exit.isFailure(activeExit)) {
        setError(m.auth_invite_accept_error())
        return
      }
      await navigate({
        to: "/orgs/$orgSlug",
        params: { orgSlug: invite.orgSlug },
        replace: true
      })
    } finally {
      setPending(null)
    }
  }

  const onDecline = async () => {
    setError(null)
    setPending("decline")
    try {
      const declineExit = await decline()
      if (Exit.isFailure(declineExit)) {
        setError(m.auth_invite_decline_error())
        return
      }
      await navigate({ to: "/welcome", replace: true })
    } finally {
      setPending(null)
    }
  }

  const initial = invite.orgName.trim().charAt(0).toUpperCase() || "·"

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {m.auth_invite_title()}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {m.auth_invite_body({ org: invite.orgName })}
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-4",
          busy && "animate-pulse"
        )}
      >
        <div
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border ring-inset"
        >
          <span className="font-mono text-base leading-none font-medium text-foreground">
            {initial}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm leading-5 font-medium text-foreground">
              {invite.orgName}
            </span>
            <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-px text-[10.5px] leading-[1.5] font-medium text-muted-foreground capitalize">
              {invitationRoleLabel(invite.role)}
            </span>
          </div>
          <div className="truncate text-[12.5px] leading-5 text-muted-foreground">
            {invitationInviterDetail(invite.inviterEmail)}
          </div>
        </div>
      </div>
      {(error ?? acceptError) ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? acceptError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          leadingIcon={MailCheck}
          loading={accepting}
          disabled={busy}
          onClick={onAccept}
        >
          {m.auth_invites_accept_button()}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          loading={declining}
          disabled={busy}
          onClick={onDecline}
        >
          {m.auth_invites_decline_button()}
        </Button>
      </div>
    </div>
  )
}

function InviteUnavailable() {
  const signOut = useAtomSet(logout)

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {m.auth_invite_unavailable_title()}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {m.auth_invite_unavailable_body()}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" render={<Link to="/welcome" />}>
          {m.auth_invite_unavailable_cta()}
        </Button>
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

function InviteSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-3/5 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-4">
        <div className="size-11 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}
