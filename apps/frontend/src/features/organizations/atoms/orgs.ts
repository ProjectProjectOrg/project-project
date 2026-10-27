import {
  ORG_DELETE_GRACE_DAYS,
  OrgActor,
  type InviteMemberInput,
  type OrgDetail,
  type OrgMember,
  type OrgMembers,
  type RenameOrgInput,
  type TransferOrgOwnershipInput,
  type UpdateMemberRoleInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

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

export const orgActor = Atom.family((req: OrgRequest) =>
  Atom.make((get) => {
    const detail = get(orgDetail(req))
    return AsyncResult.isSuccess(detail)
      ? OrgActor.make(detail.value.permissions)
      : OrgActor.none
  })
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
  viewMutation(orgDetail(req), {
    name: "renameOrg",
    predict: (org, input: RenameOrgInput) => ({ ...org, name: input.name }),
    call: (client, input) =>
      client.org.rename({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: () => [Keys.orgs()]
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
  viewMutation(orgDetail(req), {
    name: "softDeleteOrg",
    predict: (org, _input: void) => softDeleted(org),
    call: (client) => client.org.softDelete({ params: req.params }),
    confirm: replaceWith,
    publish: () => [Keys.orgs()]
  })
)

export const restoreOrg = Atom.family((req: OrgRequest) =>
  viewMutation(orgDetail(req), {
    name: "restoreOrg",
    predict: (org, _input: void) => ({
      ...org,
      deletedAt: null,
      purgeAt: null
    }),
    call: (client) => client.org.restore({ params: req.params }),
    confirm: replaceWith,
    publish: () => [Keys.orgs()]
  })
)

const pendingInvitationId = (email: string) => `pending-invitation:${email}`

export const inviteMember = Atom.family((req: OrgRequest) =>
  viewMutation(orgMembers(req), {
    name: "inviteMember",
    predict: (value, input: InviteMemberInput) => ({
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
    }),
    call: (client, input) =>
      client.org.inviteMember({ params: req.params, payload: input }),
    confirm: (value, invitation, input) => ({
      ...value,
      invitations: value.invitations.map((pending) =>
        pending.id === pendingInvitationId(input.email) ? invitation : pending
      )
    })
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

type MemberKey = Readonly<{ req: OrgRequest; userId: string }>

export const updateMemberRole = Atom.family(({ req, userId }: MemberKey) =>
  viewMutation(orgMembers(req), {
    name: "updateMemberRole",
    predict: (value, input: UpdateMemberRoleInput) => ({
      ...value,
      members: value.members.map((member) =>
        member.userId === userId ? { ...member, role: input.role } : member
      )
    }),
    call: (client, input) =>
      client.org.updateMemberRole({
        params: { ...req.params, userId },
        payload: input
      }),
    confirm: (value, member) => withMemberRole(value, userId, member)
  })
)

const withoutMember = (value: OrgMembers, userId: string): OrgMembers => ({
  ...value,
  members: value.members.filter((member) => member.userId !== userId)
})

export const removeMember = Atom.family(({ req, userId }: MemberKey) =>
  viewMutation(orgMembers(req), {
    name: "removeMember",
    predict: (value, _input: void) => withoutMember(value, userId),
    call: (client) =>
      client.org.removeMember({ params: { ...req.params, userId } }),
    confirm: (value) => withoutMember(value, userId),
    publish: () => [
      Keys.orgMembers(req.params.orgSlug),
      Keys.projects(req.params.orgSlug)
    ]
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
    viewMutation(orgMembers(req), {
      name: "cancelInvitation",
      predict: (value, _input: void) => withoutInvitation(value, invitationId),
      call: (client) =>
        client.org.cancelInvitation({
          params: { ...req.params, invitationId }
        }),
      confirm: (value) => withoutInvitation(value, invitationId)
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
    viewMutation(orgMembers(req), {
      name: "transferOwnership",
      predict: (value, input: TransferOrgOwnershipInput) =>
        withOwnershipTransferred(value, input.userId, callerUserId),
      call: (client, input) =>
        client.org.transferOwnership({ params: req.params, payload: input }),
      confirm: replaceWith,
      publish: () => [Keys.org(req.params.orgSlug), Keys.orgs()]
    })
)

export const leaveOrg = Atom.family((req: OrgRequest) =>
  Api.runtime.fn(
    Effect.fn("leaveOrg")(function* (_input: void) {
      yield* Api.use((client) => client.org.leave({ params: req.params }))
      yield* Reactivity.invalidate([Keys.orgs(), Keys.me()])
    })
  )
)
