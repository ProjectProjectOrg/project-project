import type {
  Conflict,
  Org as OrgSummary,
  OrgDetail,
  OrgScope
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface OrgShape {
  readonly myOrgs: (userId: string) => Effect.Effect<ReadonlyArray<OrgSummary>>
  readonly get: () => Effect.Effect<OrgDetail, never, OrgScope>
  readonly softDelete: () => Effect.Effect<OrgDetail, never, OrgScope>
  readonly restore: () => Effect.Effect<OrgDetail, Conflict, OrgScope>
}

export class Org extends Context.Service<Org, OrgShape>()(
  "@pp/server-core/organizations/Org"
) {}
