import { Context, type Effect } from "effect"
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

export class CurrentOrg extends Context.Tag("CurrentOrg")<
  CurrentOrg,
  CurrentOrgShape
>() {}
