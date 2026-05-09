import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import { NotFound, type Role } from "@projectproject/shared"

export interface CurrentOrgShape {
  readonly resolve: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<
    { organizationId: string; orgSlug: string; role: Role },
    NotFound
  >
}

export class CurrentOrg extends Context.Tag("@projectproject/backend/Services/CurrentOrg")<
  CurrentOrg,
  CurrentOrgShape
>() {}
