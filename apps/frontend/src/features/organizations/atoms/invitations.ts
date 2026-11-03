import type { UserInvitation } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"

export type InvitationRequest = Readonly<{
  invitationId: string
}>

const invitationsQuery = query("invitations", "list", {
  timeToLive: "30 seconds",
  reactivityKeys: [Keys.invitations()]
})

const invitationsAtom = Atom.optimistic(invitationsQuery)

export const invitations = () => invitationsAtom

const without = (
  value: ReadonlyArray<UserInvitation>,
  invitationId: string
): ReadonlyArray<UserInvitation> =>
  value.filter((invitation) => invitation.id !== invitationId)

export const acceptInvitation = Atom.family(
  ({ invitationId }: InvitationRequest) =>
    viewMutation(invitations(), {
      name: "acceptInvitation",
      predict: (value, _input: void) => without(value, invitationId),
      call: (client) => client.invitations.accept({ params: { invitationId } }),
      confirm: (value) => without(value, invitationId),
      publish: () => [Keys.orgs()]
    })
)

export const rejectInvitation = Atom.family(
  ({ invitationId }: InvitationRequest) =>
    viewMutation(invitations(), {
      name: "rejectInvitation",
      predict: (value, _input: void) => without(value, invitationId),
      call: (client) => client.invitations.reject({ params: { invitationId } }),
      confirm: (value) => without(value, invitationId)
    })
)
