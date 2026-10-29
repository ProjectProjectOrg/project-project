import { Tools } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { callToolAs } from "../client/callTool"
import { CliFailure, ExitCode, usage } from "../CliFailure"
import { originOf } from "../servers/origin"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import type { Field } from "./fields"
import { root } from "./root"

export type Source = "flag" | "environment" | "default" | "only"

export type Sourced = Readonly<{ value: string; source: Source }>

export type Scope = Readonly<{
  org: Option.Option<Sourced>
  project: Option.Option<Sourced>
}>

const sourced = (value: string, source: Source): Sourced => ({ value, source })

const explicit = (flag: Option.Option<string>, variable: string) =>
  Option.match(flag, {
    onSome: (value) => Effect.succeedSome(sourced(value, "flag")),
    onNone: () =>
      Config.option(Config.String(variable)).pipe(
        Effect.map(
          Option.flatMap((value) =>
            value.trim() === ""
              ? Option.none()
              : Option.some(sourced(value.trim(), "environment"))
          )
        ),
        Effect.orElseSucceed(() => Option.none<Sourced>())
      )
  })

export const serverChoice = Effect.flatMap(root, (flags) =>
  explicit(flags.server, "PP_SERVER")
)

export const currentServer = Effect.gen(function* () {
  const chosen = yield* serverChoice
  const origin = Option.flatMap(chosen, (choice) => originOf(choice.value))
  if (Option.isSome(chosen) && Option.isNone(origin)) {
    return yield* usage(`"${chosen.value.value}" isn't a valid server address.`)
  }
  return yield* (yield* ServerStore).select(origin)
})

export const myOrgs = (server: SavedServer) =>
  callToolAs(server, "me", {}, Tools.tools.me.successSchema).pipe(
    Effect.map((me) => me.roles.map((role) => role.orgSlug))
  )

export const orgProjects = (server: SavedServer, org: string) =>
  callToolAs(
    server,
    "list_projects",
    { orgSlug: org, limit: 200 },
    Tools.tools.list_projects.successSchema
  ).pipe(Effect.map((page) => page.items.map((project) => project.slug)))

const savedOrg = (server: SavedServer) =>
  Option.map(Option.fromNullishOr(server.scope), (scope) =>
    sourced(scope.org, "default")
  )

const savedProject = (server: SavedServer, org: Option.Option<Sourced>) =>
  Option.flatMap(Option.fromNullishOr(server.scope), (scope) =>
    Option.isSome(org) && org.value.value === scope.org
      ? Option.map(Option.fromNullishOr(scope.project), (project) =>
          sourced(project, "default")
        )
      : Option.none()
  )

export const configuredOrg = (server: SavedServer) =>
  Effect.gen(function* () {
    const flags = yield* root
    const given = yield* explicit(flags.org, "PP_ORG")
    return Option.orElse(given, () => savedOrg(server))
  })

export const configuredProject = (
  server: SavedServer,
  org: Option.Option<Sourced>
) =>
  Effect.gen(function* () {
    const flags = yield* root
    const given = yield* explicit(flags.project, "PP_PROJECT")
    return Option.orElse(given, () => savedProject(server, org))
  })

const listed = (slugs: ReadonlyArray<string>) => slugs.join(", ")

export const resolveOrg = (server: SavedServer) =>
  Effect.gen(function* () {
    const configured = yield* configuredOrg(server)
    if (Option.isSome(configured)) return configured.value
    const orgs = yield* myOrgs(server)
    const [only] = orgs
    if (only !== undefined && orgs.length === 1) return sourced(only, "only")
    return yield* usage(
      orgs.length === 0
        ? `You don't belong to any org on ${server.origin} yet.`
        : `This command needs an org. Yours: ${listed(orgs)}.\nPass --org <slug>, or make one your default with \`pp use <org>\`.`
    )
  })

export const resolveProject = (
  server: SavedServer,
  org: Option.Option<Sourced>
) =>
  Effect.gen(function* () {
    const configured = yield* configuredProject(server, org)
    if (Option.isSome(configured)) return configured.value
    if (Option.isNone(org)) {
      return yield* usage("This command needs an org. Pass --org <slug>.")
    }
    const projects = yield* orgProjects(server, org.value.value)
    const [only] = projects
    if (only !== undefined && projects.length === 1) {
      return sourced(only, "only")
    }
    return yield* usage(
      projects.length === 0
        ? `${org.value.value} has no projects yet.`
        : `This command needs a project in ${org.value.value}. Its projects: ${listed(projects)}.\nPass --project <slug>, or make one your default with \`pp use ${org.value.value}/<project>\`.`
    )
  })

export type GivenScope = Readonly<{ orgSlug?: string; projectSlug?: string }>

const fromInput = (value: string | undefined) =>
  value === undefined ? Option.none() : Option.some(sourced(value, "flag"))

export const resolveScope = (
  server: SavedServer,
  fields: ReadonlyArray<Field>,
  given: GivenScope = {}
) =>
  Effect.gen(function* () {
    const orgField = fields.find((field) => field.name === "orgSlug")
    const projectField = fields.find((field) => field.name === "projectSlug")
    const needsOrg =
      orgField?.required === true || projectField?.required === true
    const givenOrg = fromInput(given.orgSlug)
    const org: Option.Option<Sourced> =
      Option.isSome(givenOrg) || orgField === undefined
        ? givenOrg
        : needsOrg
          ? Option.some(yield* resolveOrg(server))
          : yield* configuredOrg(server)
    const givenProject = fromInput(given.projectSlug)
    const project: Option.Option<Sourced> =
      Option.isSome(givenProject) || projectField === undefined
        ? givenProject
        : projectField.required
          ? Option.some(yield* resolveProject(server, org))
          : yield* configuredProject(server, org)
    const scope: Scope = { org, project }
    return scope
  })

const usedDefault = (scope: Scope) =>
  [scope.org, scope.project].some(
    (part) => Option.isSome(part) && part.value.source === "default"
  )

const scopeLabel = (scope: Scope) =>
  [scope.org, scope.project]
    .flatMap((part) => (Option.isSome(part) ? [part.value.value] : []))
    .join("/")

export const explainDefault =
  (scope: Scope) =>
  <A, R>(effect: Effect.Effect<A, CliFailure, R>) =>
    effect.pipe(
      Effect.mapError((failure) =>
        usedDefault(scope) &&
        (failure.code === ExitCode.forbidden ||
          failure.code === ExitCode.notFound)
          ? new CliFailure({
              message: `${failure.message}\n\nThis used your default ${scopeLabel(scope)}. If you no longer have access to it, pick another with \`pp use\`.`,
              code: failure.code
            })
          : failure
      )
    )
