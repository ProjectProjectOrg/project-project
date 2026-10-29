import { Access } from "@pp/server-core/access/Access"
import {
  Forbidden,
  type OrgRequirement,
  OrgScope,
  permits,
  type ProjectRequirement,
  ProjectScope
} from "@pp/shared"
import * as Effect from "effect/Effect"

export const inOrg =
  <I extends Readonly<{ orgSlug: string }>, A, E, R>(
    requires: OrgRequirement,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    Effect.gen(function* () {
      const scope = yield* (yield* Access).org(input.orgSlug)
      if (!permits(scope.permissions, requires)) {
        return yield* new Forbidden()
      }
      return yield* handler(input).pipe(Effect.provideService(OrgScope, scope))
    })

export const inProject =
  <I extends Readonly<{ orgSlug: string; projectSlug: string }>, A, E, R>(
    requires: ProjectRequirement,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    Effect.gen(function* () {
      const scope = yield* (yield* Access).project(
        input.orgSlug,
        input.projectSlug
      )
      if (!permits(scope.permissions, requires)) {
        return yield* new Forbidden()
      }
      return yield* handler(input).pipe(
        Effect.provideService(ProjectScope, scope)
      )
    })
