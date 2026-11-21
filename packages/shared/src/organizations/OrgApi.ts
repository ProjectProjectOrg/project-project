import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { IncludeDeletedOrg, OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  InvitationNotAcceptable,
  LastProjectPmBlocked,
  NotFound,
  OrgConflict,
  OrgRestoreRejected,
  Validation
} from "../errors"
import { OrgPath } from "../http/paths"
import { Slug } from "../projects/Project"
import {
  InviteMemberInput,
  Org,
  OrgDetail,
  OrgInvitation,
  OrgMember,
  OrgMembers,
  RenameOrgInput,
  TransferOrgOwnershipInput,
  UpdateMemberRoleInput,
  UserInvitation
} from "./Org"
import { OrgEmailError, OrgEmailStatus, SaveOrgEmailInput } from "./OrgEmail"

const OrgMemberPath = Schema.Struct({ orgSlug: Slug, userId: Schema.String })

const OrgInvitationPath = Schema.Struct({
  orgSlug: Slug,
  invitationId: Schema.String
})

const InvitationPath = Schema.Struct({ invitationId: Schema.String })

export const OrgGroup = HttpApiGroup.make("org")
  .add(
    HttpApiEndpoint.get("myOrgs", "/orgs", {
      success: Schema.Array(Org)
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug", {
      params: OrgPath,
      success: OrgDetail
    })
      .annotate(RequiresOrg, "membership")
      .annotate(IncludeDeletedOrg, true)
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("softDelete", "/orgs/:orgSlug/soft-delete", {
      params: OrgPath,
      success: OrgDetail
    })
      .annotate(RequiresOrg, { organization: ["delete"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("restore", "/orgs/:orgSlug/restore", {
      params: OrgPath,
      success: OrgDetail,
      error: [OrgRestoreRejected]
    })
      .annotate(RequiresOrg, { organization: ["delete"] })
      .annotate(IncludeDeletedOrg, true)
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("members", "/orgs/:orgSlug/members", {
      params: OrgPath,
      success: OrgMembers
    })
      .annotate(RequiresOrg, { member: ["read"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch("rename", "/orgs/:orgSlug", {
      params: OrgPath,
      payload: RenameOrgInput,
      success: OrgDetail
    })
      .annotate(RequiresOrg, { organization: ["update"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("inviteMember", "/orgs/:orgSlug/members", {
      params: OrgPath,
      payload: InviteMemberInput,
      success: OrgInvitation,
      error: [OrgConflict, Validation]
    })
      .annotate(RequiresOrg, { invitation: ["create"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateMemberRole",
      "/orgs/:orgSlug/members/:userId",
      {
        params: OrgMemberPath,
        payload: UpdateMemberRoleInput,
        success: OrgMember,
        error: [OrgConflict]
      }
    )
      .annotate(RequiresOrg, { member: ["update"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete("removeMember", "/orgs/:orgSlug/members/:userId", {
      params: OrgMemberPath,
      success: HttpApiSchema.NoContent,
      error: [LastProjectPmBlocked, OrgConflict]
    })
      .annotate(RequiresOrg, { member: ["delete"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "cancelInvitation",
      "/orgs/:orgSlug/invitations/:invitationId",
      {
        params: OrgInvitationPath,
        success: HttpApiSchema.NoContent
      }
    )
      .annotate(RequiresOrg, { invitation: ["cancel"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "transferOwnership",
      "/orgs/:orgSlug/transfer-ownership",
      {
        params: OrgPath,
        payload: TransferOrgOwnershipInput,
        success: OrgMembers,
        error: [Validation]
      }
    )
      .annotate(RequiresOrg, { organization: ["transfer"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("setActive", "/orgs/:orgSlug/active", {
      params: OrgPath,
      success: HttpApiSchema.NoContent
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("leave", "/orgs/:orgSlug/leave", {
      params: OrgPath,
      success: HttpApiSchema.NoContent,
      error: [LastProjectPmBlocked, OrgConflict]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .middleware(Authentication)

export const InvitationsGroup = HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/invitations", {
      success: Schema.Array(UserInvitation),
      error: InvitationNotAcceptable
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/invitations/:invitationId", {
      params: InvitationPath,
      success: UserInvitation,
      error: NotFound
    })
  )
  .add(
    HttpApiEndpoint.post("accept", "/invitations/:invitationId/accept", {
      params: InvitationPath,
      success: Org,
      error: [NotFound, InvitationNotAcceptable]
    })
  )
  .add(
    HttpApiEndpoint.post("reject", "/invitations/:invitationId/reject", {
      params: InvitationPath,
      success: HttpApiSchema.NoContent,
      error: NotFound
    })
  )
  .middleware(Authentication)

export const OrgEmailGroup = HttpApiGroup.make("orgEmail")
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/email", {
      params: OrgPath,
      success: OrgEmailStatus
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.put("save", "/orgs/:orgSlug/email", {
      params: OrgPath,
      payload: SaveOrgEmailInput,
      success: OrgEmailStatus,
      error: OrgEmailError
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.post("test", "/orgs/:orgSlug/email/test", {
      params: OrgPath,
      success: OrgEmailStatus,
      error: OrgEmailError
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/orgs/:orgSlug/email", {
      params: OrgPath,
      success: OrgEmailStatus
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .middleware(OrgAccess)
  .middleware(Authentication)
