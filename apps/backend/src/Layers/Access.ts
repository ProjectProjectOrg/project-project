import { Access } from "@pp/server-core/access/Access"
import {
  Forbidden,
  IncludeDeletedOrg,
  NotFound,
  OrgAccess,
  OrgPath,
  OrgScope,
  permits,
  ProjectAccess,
  ProjectPath,
  ProjectScope,
  RequiresOrg,
  RequiresProject
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { HttpRouter } from "effect/unstable/http"
import type { HttpApiEndpoint } from "effect/unstable/httpapi"

const requirementOf = <I, S>(
  endpoint: HttpApiEndpoint.Top,
  key: Context.Key<I, S>
): Effect.Effect<S> =>
  Option.match(Context.getOption(endpoint.annotations, key), {
    onNone: () =>
      Effect.die(
        `${endpoint.method} ${endpoint.path} has no ${key.key} annotation`
      ),
    onSome: Effect.succeed
  })

export const OrgAccessLive = Layer.effect(
  OrgAccess,
  Effect.gen(function* () {
    const access = yield* Access
    return OrgAccess.of(
      Effect.fn("OrgAccess")(function* (httpEffect, { endpoint }) {
        const requirement = yield* requirementOf(endpoint, RequiresOrg)
        const { orgSlug } = yield* HttpRouter.schemaPathParams(OrgPath).pipe(
          Effect.catchTag("SchemaError", () => new NotFound())
        )
        const scope = yield* access.org(orgSlug, {
          includeDeleted: Context.get(endpoint.annotations, IncludeDeletedOrg)
        })
        if (!permits(scope.permissions, requirement)) {
          return yield* new Forbidden()
        }
        return yield* Effect.provideService(httpEffect, OrgScope, scope)
      })
    )
  })
)

export const ProjectAccessLive = Layer.effect(
  ProjectAccess,
  Effect.gen(function* () {
    const access = yield* Access
    return ProjectAccess.of(
      Effect.fn("ProjectAccess")(function* (httpEffect, { endpoint }) {
        const requirement = yield* requirementOf(endpoint, RequiresProject)
        const { orgSlug, slug } = yield* HttpRouter.schemaPathParams(
          ProjectPath
        ).pipe(Effect.catchTag("SchemaError", () => new NotFound()))
        const scope = yield* access.project(orgSlug, slug)
        if (!permits(scope.permissions, requirement)) {
          return yield* new Forbidden()
        }
        return yield* Effect.provideService(httpEffect, ProjectScope, scope)
      })
    )
  })
)
