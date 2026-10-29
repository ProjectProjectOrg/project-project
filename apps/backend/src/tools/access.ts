import { Access } from "@pp/server-core/access/Access"
import {
  Forbidden,
  OrgScope,
  permits,
  ProjectScope,
  ToolAccess,
  type ToolAccessShape,
  type ToolName,
  Tools
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

type Scope = ToolAccessShape["scope"]

type AccessIn<S extends Scope> = Extract<
  ToolAccessShape,
  Readonly<{ scope: S }>
>

const isIn = <S extends Scope>(
  access: ToolAccessShape,
  scope: S
): access is AccessIn<S> => access.scope === scope

const declaredAccess = <S extends Scope>(name: ToolName, scope: S) =>
  Option.match(Context.getOption(Tools.tools[name].annotations, ToolAccess), {
    onNone: () => Effect.die(`${name} declares no access`),
    onSome: (access) =>
      isIn(access, scope)
        ? Effect.succeed(access)
        : Effect.die(`${name} is declared for ${access.scope}, not ${scope}`)
  })

export const forUser =
  <I, A, E, R>(name: ToolName, handler: (input: I) => Effect.Effect<A, E, R>) =>
  (input: I) =>
    Effect.flatMap(declaredAccess(name, "user"), () => handler(input))

export const inOrg =
  <I extends Readonly<{ orgSlug: string }>, A, E, R>(
    name: ToolName,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    Effect.gen(function* () {
      const access = yield* declaredAccess(name, "org")
      const scope = yield* (yield* Access).org(input.orgSlug)
      if (!permits(scope.permissions, access.requires)) {
        return yield* new Forbidden()
      }
      return yield* handler(input).pipe(Effect.provideService(OrgScope, scope))
    })

export const inProject =
  <I extends Readonly<{ orgSlug: string; projectSlug: string }>, A, E, R>(
    name: ToolName,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    Effect.gen(function* () {
      const access = yield* declaredAccess(name, "project")
      const scope = yield* (yield* Access).project(
        input.orgSlug,
        input.projectSlug
      )
      if (!permits(scope.permissions, access.requires)) {
        return yield* new Forbidden()
      }
      return yield* handler(input).pipe(
        Effect.provideService(ProjectScope, scope)
      )
    })
