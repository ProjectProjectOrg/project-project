import type { UserInvitation } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const pickActiveInvitation = (
  invitations: ReadonlyArray<UserInvitation>
): UserInvitation | null => {
  let active: UserInvitation | null = null
  for (const invitation of invitations) {
    if (!active) {
      active = invitation
      continue
    }
    const diff = invitation.createdAt.getTime() - active.createdAt.getTime()
    if (diff > 0 || (diff === 0 && invitation.orgSlug < active.orgSlug)) {
      active = invitation
    }
  }
  return active
}

export const invitationRoleLabel = (role: string): string => {
  if (role === "owner") return m.auth_invites_role_owner()
  if (role === "admin") return m.auth_invites_role_admin()
  if (role === "guest") return m.auth_invites_role_guest()
  return m.auth_invites_role_member()
}

export const invitationInviterDetail = (inviterEmail: string | null): string =>
  inviterEmail === null
    ? m.auth_invites_row_detail_unknown_inviter()
    : m.auth_invites_row_detail({ inviter: inviterEmail })

export type InviteAcceptError =
  | { _tag: "InviteExpired"; inviteId: string }
  | { _tag: "InviteNotFound"; inviteId: string }
  | { _tag: "InviteNotRecipient"; inviteId: string }
  | { _tag: "InviteEmailVerificationRequired"; inviteId: string }
  | { _tag: "InviteAcceptFailed"; inviteId: string; cause: unknown }

export const hasErrorCode = (cause: unknown, code: string) =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  cause.code === code
