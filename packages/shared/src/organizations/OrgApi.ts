import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { IncludeDeletedOrg, OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  Conflict,
  Forbidden,
  InvitationNotAcceptable,
  LastProjectPmBlocked,
  NotFound,
  Unauthorized,
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
      success: Schema.Array(Org),
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug", {
      params: OrgPath,
      success: OrgDetail,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .annotate(IncludeDeletedOrg, true)
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("softDelete", "/orgs/:orgSlug/soft-delete", {
      params: OrgPath,
      success: OrgDetail,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, { organization: ["delete"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("restore", "/orgs/:orgSlug/restore", {
      params: OrgPath,
      success: OrgDetail,
      error: [Unauthorized, NotFound, Forbidden, Conflict]
    })
      .annotate(RequiresOrg, { organization: ["delete"] })
      .annotate(IncludeDeletedOrg, true)
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("members", "/orgs/:orgSlug/members", {
      params: OrgPath,
      success: OrgMembers,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, { member: ["read"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch("rename", "/orgs/:orgSlug", {
      params: OrgPath,
      payload: RenameOrgInput,
      success: OrgDetail,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, { organization: ["update"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("inviteMember", "/orgs/:orgSlug/members", {
      params: OrgPath,
      payload: InviteMemberInput,
      success: OrgInvitation,
      error: [Unauthorized, NotFound, Forbidden, Validation, Conflict]
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
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresOrg, { member: ["update"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete("removeMember", "/orgs/:orgSlug/members/:userId", {
      params: OrgMemberPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Forbidden, Conflict, LastProjectPmBlocked]
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
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
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
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    )
      .annotate(RequiresOrg, { organization: ["transfer"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("setActive", "/orgs/:orgSlug/active", {
      params: OrgPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("leave", "/orgs/:orgSlug/leave", {
      params: OrgPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Conflict, LastProjectPmBlocked]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .middleware(Authentication)

export const InvitationsGroup = HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/invitations", {
      success: Schema.Array(UserInvitation),
      error: [Unauthorized, InvitationNotAcceptable]
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/invitations/:invitationId", {
      params: InvitationPath,
      success: UserInvitation,
      error: [Unauthorized, NotFound]
    })
  )
  .add(
    HttpApiEndpoint.post("accept", "/invitations/:invitationId/accept", {
      params: InvitationPath,
      success: Org,
      error: [Unauthorized, NotFound, InvitationNotAcceptable]
    })
  )
  .add(
    HttpApiEndpoint.post("reject", "/invitations/:invitationId/reject", {
      params: InvitationPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound]
    })
  )
  .middleware(Authentication)

export const OrgEmailGroup = HttpApiGroup.make("orgEmail")
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/email", {
      params: OrgPath,
      success: OrgEmailStatus,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.put("save", "/orgs/:orgSlug/email", {
      params: OrgPath,
      payload: SaveOrgEmailInput,
      success: OrgEmailStatus,
      error: [Unauthorized, NotFound, Forbidden, OrgEmailError]
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.post("test", "/orgs/:orgSlug/email/test", {
      params: OrgPath,
      success: OrgEmailStatus,
      error: [Unauthorized, NotFound, Forbidden, OrgEmailError]
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/orgs/:orgSlug/email", {
      params: OrgPath,
      success: OrgEmailStatus,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresOrg, { integration: ["manage"] })
  )
  .middleware(OrgAccess)
  .middleware(Authentication)
