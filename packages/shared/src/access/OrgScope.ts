import type { Statement } from "@pp/access"
import type { Org } from "@pp/access/roles"
import * as Context from "effect/Context"

import type { OrgRole } from "../organizations/Org"

/** @effect-leakable-service */
export class OrgScope extends Context.Service<
  OrgScope,
  Readonly<{
    userId: string
    organizationId: string
    orgSlug: string
    role: OrgRole
    deletedAt: Date | null
    permissions: Statement.Role<Org.OrgResources>
  }>
>()("@pp/shared/access/OrgScope") {}
