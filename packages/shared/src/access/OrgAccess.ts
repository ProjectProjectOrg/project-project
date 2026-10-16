import type { Org } from "@pp/access/roles"
import * as Context from "effect/Context"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

import type { CurrentUser } from "../Authentication"
import { Forbidden, NotFound } from "../errors"
import type { OrgScope } from "./OrgScope"
import type { Requirement } from "./Requirement"

export type OrgRequirement = Requirement<Org.OrgResources>

export class RequiresOrg extends Context.Service<RequiresOrg, OrgRequirement>()(
  "@pp/shared/access/OrgAccess/RequiresOrg"
) {}

export const IncludeDeletedOrg = Context.Reference<boolean>(
  "@pp/shared/access/OrgAccess/IncludeDeletedOrg",
  { defaultValue: () => false }
)

export class OrgAccess extends HttpApiMiddleware.Service<
  OrgAccess,
  {
    requires: CurrentUser
    provides: OrgScope
  }
>()("@pp/shared/access/OrgAccess", {
  error: [NotFound, Forbidden]
}) {}
