import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type { UserInvitation } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type InvitationRequest = Readonly<{
  invitationId: string
}>

const invitationsQuery = Api.query("invitations", "list", {
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
    Atom.optimisticFn(invitations(), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) => without(value, invitationId)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            const org = yield* Api.use((client) =>
              client.invitations.accept({ params: { invitationId } })
            )
            set(
              AsyncResult.map(get(invitations()), (value) =>
                without(value, invitationId)
              )
            )
            yield* Reactivity.invalidate([Keys.orgs()])
            return org
          })
        )
    })
)

export const rejectInvitation = Atom.family(
  ({ invitationId }: InvitationRequest) =>
    Atom.optimisticFn(invitations(), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) => without(value, invitationId)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.invitations.reject({ params: { invitationId } })
            )
            set(
              AsyncResult.map(get(invitations()), (value) =>
                without(value, invitationId)
              )
            )
          })
        )
    })
)
