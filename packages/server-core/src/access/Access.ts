import type {
  CurrentUser,
  NotFound,
  OrgScope,
  OrgScopeShape,
  ProjectScopeShape
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type OrgLookup = Readonly<{ includeDeleted?: boolean }>

export type AccessShape = Readonly<{
  org: (
    orgSlug: string,
    lookup?: OrgLookup
  ) => Effect.Effect<OrgScopeShape, NotFound, CurrentUser>
  project: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ProjectScopeShape, NotFound, CurrentUser>
  projectsInOrg: () => Effect.Effect<
    ReadonlyArray<ProjectScopeShape>,
    never,
    OrgScope
  >
}>

export class Access extends Context.Service<Access, AccessShape>()(
  "@pp/server-core/access/Access"
) {}
