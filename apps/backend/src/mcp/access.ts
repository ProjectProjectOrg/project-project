import { Access } from "@pp/server-core/access/Access"
import {
  CurrentUser,
  Forbidden,
  OrgScope,
  permits,
  type OrgRequirement
} from "@pp/shared"
import * as Effect from "effect/Effect"

import { McpCurrentUser } from "./McpRequestUser"

export const orgTool =
  <I extends Readonly<{ orgSlug: string }>, A, E, R>(
    requirement: OrgRequirement,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    Effect.gen(function* () {
      const access = yield* Access
      const scope = yield* access.org(input.orgSlug)
      if (!permits(scope.permissions, requirement)) {
        return yield* new Forbidden()
      }
      return yield* handler(input).pipe(Effect.provideService(OrgScope, scope))
    }).pipe(Effect.provideServiceEffect(CurrentUser, McpCurrentUser))
