import * as Schema from "effect/Schema"
import { AssignableRole, Slug } from "./Project"

export const ORG_DELETE_GRACE_DAYS = 14

export const OrgRole = Schema.Literals(["owner", "admin", "member"])
export type OrgRole = typeof OrgRole.Type

export const Org = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  role: OrgRole
})
export type Org = typeof Org.Type

export const OrgDetail = Schema.Struct({
  id: Schema.String,
  slug: Slug,
  name: Schema.String,
  role: OrgRole,
  createdAt: Schema.DateFromString,
  deletedAt: Schema.NullOr(Schema.DateFromString),
  purgeAt: Schema.NullOr(Schema.DateFromString)
})
export type OrgDetail = typeof OrgDetail.Type

export { AssignableRole }

export const OrgMember = Schema.Struct({
  userId: Schema.String,
  role: OrgRole,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String)
})
export type OrgMember = typeof OrgMember.Type

export const OrgInvitation = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: OrgRole
})
export type OrgInvitation = typeof OrgInvitation.Type

export const OrgMembers = Schema.Struct({
  members: Schema.Array(OrgMember),
  invitations: Schema.Array(OrgInvitation)
})
export type OrgMembers = typeof OrgMembers.Type

export const UserInvitation = Schema.Struct({
  id: Schema.String,
  orgSlug: Slug,
  orgName: Schema.String,
  role: OrgRole,
  inviterEmail: Schema.NullOr(Schema.String),
  expiresAt: Schema.DateFromString
})
export type UserInvitation = typeof UserInvitation.Type

export const InviteMemberInput = Schema.Struct({
  email: Schema.String,
  role: AssignableRole
})
export type InviteMemberInput = typeof InviteMemberInput.Type

export const UpdateMemberRoleInput = Schema.Struct({ role: AssignableRole })
export type UpdateMemberRoleInput = typeof UpdateMemberRoleInput.Type

export const OrgTransferOwnershipInput = Schema.Struct({
  toUserId: Schema.String
})
export type OrgTransferOwnershipInput = typeof OrgTransferOwnershipInput.Type

export const RenameOrgInput = Schema.Struct({ name: Schema.String })
export type RenameOrgInput = typeof RenameOrgInput.Type
