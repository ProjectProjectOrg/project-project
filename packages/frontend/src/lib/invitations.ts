import * as DateTime from "effect/DateTime"

export type RawInvitation = {
  id: string
  email: string
  role: string
  organizationId: string
  organizationName: string
  inviterId: string
  status: string
  expiresAt: Date | string
  createdAt: Date | string
}

export type PendingInvite = RawInvitation & {
  organizationSlug: string
  inviterEmail: string
  expiresAt: Date
  createdAt: Date
}

export type InviteAcceptSuccess = {
  invite: PendingInvite
}

export type InviteAcceptFailure = {
  invite: PendingInvite
  error: unknown
}

export type InviteAcceptResult = {
  successes: InviteAcceptSuccess[]
  failures: InviteAcceptFailure[]
  activeInvite: PendingInvite | null
}

const normalizedEmail = (email: string) => email.trim().toLowerCase()

export const isActionableInvitation = (
  invite: RawInvitation,
  userEmail: string,
  now: Date
) =>
  invite.status === "pending" &&
  normalizedEmail(invite.email) === normalizedEmail(userEmail) &&
  toDate(invite.expiresAt) > now

export const filterActionableInvitations = (
  invites: readonly RawInvitation[],
  userEmail: string,
  now = DateTime.toDate(DateTime.unsafeNow())
) => invites.filter((invite) => isActionableInvitation(invite, userEmail, now))

export const toPendingInvite = (
  invite: RawInvitation & { organizationSlug: string; inviterEmail: string }
): PendingInvite => ({
  ...invite,
  expiresAt: toDate(invite.expiresAt),
  createdAt: toDate(invite.createdAt)
})

export const pickActiveInvite = (
  invites: readonly PendingInvite[]
): PendingInvite | null => {
  let active: PendingInvite | null = null
  for (const invite of invites) {
    if (!active) {
      active = invite
      continue
    }
    const diff = invite.createdAt.getTime() - active.createdAt.getTime()
    // The newest invite is the one most likely to have caused this sign-in.
    if (
      diff > 0 ||
      (diff === 0 && invite.organizationSlug < active.organizationSlug)
    ) {
      active = invite
    }
  }
  return active
}

export const acceptInvitations = async (
  invites: readonly PendingInvite[],
  accept: (invite: PendingInvite) => Promise<void>
): Promise<InviteAcceptResult> => {
  const settled = await Promise.allSettled(
    invites.map(async (invite) => {
      await accept(invite)
      return invite
    })
  )
  const successes: InviteAcceptSuccess[] = []
  const failures: InviteAcceptFailure[] = []

  settled.forEach((result, index) => {
    const invite = invites[index]
    if (result.status === "fulfilled") {
      successes.push({ invite: result.value })
      return
    }
    failures.push({ invite, error: result.reason })
  })

  return {
    successes,
    failures,
    activeInvite: pickActiveInvite(successes.map((success) => success.invite))
  }
}

const toDate = (value: Date | string) =>
  value instanceof Date ? value : DateTime.toDate(DateTime.unsafeMake(value))
