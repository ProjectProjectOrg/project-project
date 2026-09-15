import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  ORG_DELETE_GRACE_DAYS,
  type InviteMemberInput,
  type OrgDetail,
  type OrgMember,
  type OrgMembers,
  type RenameOrgInput,
  type TransferOrgOwnershipInput,
  type UpdateMemberRoleInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type OrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const orgRequest = (orgSlug: string): OrgRequest => ({
  params: { orgSlug }
})

const userOrgsQuery = Api.query("org", "myOrgs", {
  timeToLive: "1 minute",
  reactivityKeys: [Keys.orgs()]
})

const userOrgsAtom = Atom.optimistic(userOrgsQuery)

export const userOrgs = () => userOrgsAtom

const orgDetailQuery = (req: OrgRequest) =>
  Api.query("org", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.org(req.params.orgSlug)]
  })

export const orgDetail = Atom.family((req: OrgRequest) =>
  Atom.optimistic(orgDetailQuery(req))
)

const orgMembersQuery = (req: OrgRequest) =>
  Api.query("org", "members", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.orgMembers(req.params.orgSlug)]
  })

export const orgMembers = Atom.family((req: OrgRequest) =>
  Atom.optimistic(orgMembersQuery(req))
)

export const renameOrg = Atom.family((req: OrgRequest) =>
  Atom.optimisticFn(orgDetail(req), {
    reducer: (current, input: RenameOrgInput) =>
      AsyncResult.map(current, (org) => ({ ...org, name: input.name })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: RenameOrgInput) {
          const renamed = yield* Api.use((client) =>
            client.org.rename({ params: req.params, payload: input })
          )
          set(AsyncResult.success(renamed))
          yield* Reactivity.invalidate([Keys.orgs()])
          return renamed
        })
      )
  })
)

const softDeleted = (org: OrgDetail): OrgDetail => {
  const now = DateTime.nowUnsafe()
  return {
    ...org,
    deletedAt: DateTime.toDate(now),
    purgeAt: DateTime.toDate(DateTime.add(now, { days: ORG_DELETE_GRACE_DAYS }))
  }
}

export const softDeleteOrg = Atom.family((req: OrgRequest) =>
  Atom.optimisticFn(orgDetail(req), {
    reducer: (current, _input: void) => AsyncResult.map(current, softDeleted),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const deleted = yield* Api.use((client) =>
            client.org.softDelete({ params: req.params })
          )
          set(AsyncResult.success(deleted))
          yield* Reactivity.invalidate([Keys.orgs()])
          return deleted
        })
      )
  })
)

export const restoreOrg = Atom.family((req: OrgRequest) =>
  Atom.optimisticFn(orgDetail(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (org) => ({
        ...org,
        deletedAt: null,
        purgeAt: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const restored = yield* Api.use((client) =>
            client.org.restore({ params: req.params })
          )
          set(AsyncResult.success(restored))
          yield* Reactivity.invalidate([Keys.orgs()])
          return restored
        })
      )
  })
)

const pendingInvitationId = (email: string) => `pending-invitation:${email}`

export const inviteMember = Atom.family((req: OrgRequest) =>
  Atom.optimisticFn(orgMembers(req), {
    reducer: (current, input: InviteMemberInput) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        invitations: [
          ...value.invitations,
          {
            id: pendingInvitationId(input.email),
            email: input.email,
            role: input.role,
            status: "pending" as const
          }
        ]
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: InviteMemberInput, get) {
          const invitation = yield* Api.use((client) =>
            client.org.inviteMember({ params: req.params, payload: input })
          )
          set(
            AsyncResult.map(get(orgMembers(req)), (value) => ({
              ...value,
              invitations: value.invitations.map((pending) =>
                pending.id === pendingInvitationId(input.email)
                  ? invitation
                  : pending
              )
            }))
          )
          return invitation
        })
      )
  })
)

const withMemberRole = (
  value: OrgMembers,
  userId: string,
  member: OrgMember
): OrgMembers => ({
  ...value,
  members: value.members.map((existing) =>
    existing.userId === userId ? member : existing
  )
})

export const updateMemberRole = Atom.family(
  ({ req, userId }: Readonly<{ req: OrgRequest; userId: string }>) =>
    Atom.optimisticFn(orgMembers(req), {
      reducer: (current, input: UpdateMemberRoleInput) =>
        AsyncResult.map(current, (value) => ({
          ...value,
          members: value.members.map((member) =>
            member.userId === userId ? { ...member, role: input.role } : member
          )
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: UpdateMemberRoleInput, get) {
            const member = yield* Api.use((client) =>
              client.org.updateMemberRole({
                params: { ...req.params, userId },
                payload: input
              })
            )
            set(
              AsyncResult.map(get(orgMembers(req)), (value) =>
                withMemberRole(value, userId, member)
              )
            )
            return member
          })
        )
    })
)

const withoutMember = (value: OrgMembers, userId: string): OrgMembers => ({
  ...value,
  members: value.members.filter((member) => member.userId !== userId)
})

export const removeMember = Atom.family(
  ({ req, userId }: Readonly<{ req: OrgRequest; userId: string }>) =>
    Atom.optimisticFn(orgMembers(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) => withoutMember(value, userId)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.org.removeMember({ params: { ...req.params, userId } })
            )
            set(
              AsyncResult.map(get(orgMembers(req)), (value) =>
                withoutMember(value, userId)
              )
            )
          })
        )
    })
)

const withoutInvitation = (
  value: OrgMembers,
  invitationId: string
): OrgMembers => ({
  ...value,
  invitations: value.invitations.filter(
    (invitation) => invitation.id !== invitationId
  )
})

export const cancelInvitation = Atom.family(
  ({
    req,
    invitationId
  }: Readonly<{ req: OrgRequest; invitationId: string }>) =>
    Atom.optimisticFn(orgMembers(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) =>
          withoutInvitation(value, invitationId)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            yield* Api.use((client) =>
              client.org.cancelInvitation({
                params: { ...req.params, invitationId }
              })
            )
            set(
              AsyncResult.map(get(orgMembers(req)), (value) =>
                withoutInvitation(value, invitationId)
              )
            )
          })
        )
    })
)

const withOwnershipTransferred = (
  value: OrgMembers,
  toUserId: string,
  callerUserId: string
): OrgMembers => ({
  ...value,
  members: value.members.map((member) => {
    if (member.userId === toUserId) return { ...member, role: "owner" as const }
    if (member.userId === callerUserId) {
      return { ...member, role: "admin" as const }
    }
    return member
  })
})

export const transferOwnership = Atom.family(
  ({
    req,
    callerUserId
  }: Readonly<{ req: OrgRequest; callerUserId: string }>) =>
    Atom.optimisticFn(orgMembers(req), {
      reducer: (current, input: TransferOrgOwnershipInput) =>
        AsyncResult.map(current, (value) =>
          withOwnershipTransferred(value, input.userId, callerUserId)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: TransferOrgOwnershipInput) {
            const members = yield* Api.use((client) =>
              client.org.transferOwnership({
                params: req.params,
                payload: input
              })
            )
            set(AsyncResult.success(members))
            yield* Reactivity.invalidate([
              Keys.org(req.params.orgSlug),
              Keys.orgs()
            ])
            return members
          })
        )
    })
)

export const leaveOrg = Atom.family((req: OrgRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (_input: void) {
      yield* Api.use((client) => client.org.leave({ params: req.params }))
      yield* Reactivity.invalidate([Keys.orgs(), Keys.me()])
    })
  )
)
