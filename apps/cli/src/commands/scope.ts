import { Argument, Command, Flag, Prompt } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Stdio from "effect/Stdio"

import { CliFailure, ExitCode, usage } from "../CliFailure"
import { printResult } from "../output/format"
import {
  type SavedScope,
  type SavedServer,
  ServerStore
} from "../servers/ServerStore"
import {
  configuredProject,
  currentServer,
  myOrgs,
  orgProjects,
  resolveOrg,
  resolveProject,
  type Source,
  type Sourced,
  serverChoice
} from "./context"
import { root } from "./root"

const scopeText = (scope: SavedScope) =>
  scope.project === undefined ? scope.org : `${scope.org}/${scope.project}`

export const canPrompt = Effect.gen(function* () {
  const flags = yield* root
  const stdio = yield* Stdio.Stdio
  return (
    !flags.json &&
    (yield* stdio.stdinIsTerminal) &&
    (yield* stdio.stdoutIsTerminal)
  )
})

const choose = (message: string, slugs: ReadonlyArray<string>, none?: string) =>
  Prompt.Select({
    message,
    choices: [
      ...slugs.map((slug) => ({ title: slug, value: Option.some(slug) })),
      ...(none === undefined
        ? []
        : [{ title: none, value: Option.none<string>() }])
    ]
  }).pipe(
    Prompt.run,
    Effect.orElseSucceed(() => Option.none<string>())
  )

const pickScope = (server: SavedServer, interactive: boolean) =>
  Effect.gen(function* () {
    const orgs = yield* myOrgs(server)
    const [onlyOrg] = orgs
    const org =
      onlyOrg !== undefined && orgs.length === 1
        ? Option.some(onlyOrg)
        : interactive && orgs.length > 1
          ? yield* choose("Which org should pp use by default?", orgs)
          : Option.none<string>()
    if (Option.isNone(org)) return Option.none<SavedScope>()
    const projects = yield* orgProjects(server, org.value)
    const [onlyProject] = projects
    const project =
      onlyProject !== undefined && projects.length === 1
        ? Option.some(onlyProject)
        : interactive && projects.length > 1
          ? yield* choose(
              `Which project in ${org.value}?`,
              projects,
              "No default project"
            )
          : Option.none<string>()
    const scope: SavedScope = Option.match(project, {
      onNone: () => ({ org: org.value }),
      onSome: (slug) => ({ org: org.value, project: slug })
    })
    return Option.some(scope)
  })

export const chooseDefaultScope = (server: SavedServer) =>
  Effect.gen(function* () {
    const store = yield* ServerStore
    const saved = yield* store.select(Option.some(server.origin))
    if (saved.scope !== undefined) {
      const orgs = yield* myOrgs(server)
      if (orgs.includes(saved.scope.org)) return Option.some(saved.scope)
    }
    const picked = yield* pickScope(server, yield* canPrompt)
    yield* store.setScope(server.origin, picked)
    return picked
  })

const parseTarget = (target: string) => {
  const [org, project, ...rest] = target.split("/")
  if (org === undefined || org === "" || project === "" || rest.length > 0) {
    return Effect.fail(
      usage(`"${target}" isn't an org or org/project, e.g. acme/website.`)
    )
  }
  const scope: SavedScope = project === undefined ? { org } : { org, project }
  return Effect.succeed(scope)
}

const checkScope = (server: SavedServer, scope: SavedScope) =>
  Effect.gen(function* () {
    const orgs = yield* myOrgs(server)
    if (!orgs.includes(scope.org)) {
      return yield* new CliFailure({
        message: `You don't belong to an org called ${scope.org} on ${server.origin}. Yours: ${orgs.join(", ")}.`,
        code: ExitCode.notFound
      })
    }
    if (scope.project === undefined) return
    const projects = yield* orgProjects(server, scope.org)
    if (!projects.includes(scope.project)) {
      return yield* new CliFailure({
        message: `${scope.org} has no project called ${scope.project} that you can see. Its projects: ${projects.join(", ")}.`,
        code: ExitCode.notFound
      })
    }
  })

export const useCommand = Command.make(
  "use",
  {
    target: Argument.String("org[/project]").pipe(
      Argument.withDescription(
        "The org, or org/project, to use by default, e.g. acme/website."
      ),
      Argument.optional
    ),
    clear: Flag.Boolean("clear").pipe(
      Flag.withDescription("Forget the default org and project."),
      Flag.withDefault(false)
    )
  },
  ({ target, clear }) =>
    Effect.gen(function* () {
      const flags = yield* root
      const server = yield* currentServer
      const store = yield* ServerStore
      if (clear) {
        yield* store.setScope(server.origin, Option.none())
        if (flags.json) {
          return yield* printResult(
            { server: server.origin, scope: null },
            true
          )
        }
        return yield* Console.log(
          `Cleared the default org and project for ${server.origin}.`
        )
      }
      const scope = yield* Option.match(target, {
        onSome: (value) =>
          Effect.tap(parseTarget(value), (parsed) =>
            checkScope(server, parsed)
          ),
        onNone: () =>
          Effect.gen(function* () {
            if (!(yield* canPrompt)) {
              return yield* usage(
                "Pass the org or org/project to use, e.g. `pp use acme/website`."
              )
            }
            const picked = yield* pickScope(server, true)
            if (Option.isSome(picked)) return picked.value
            return yield* usage(
              `You don't belong to any org on ${server.origin} yet.`
            )
          })
      })
      yield* store.setScope(server.origin, Option.some(scope))
      if (flags.json) {
        return yield* printResult({ server: server.origin, scope }, true)
      }
      yield* Console.log(
        `Commands on ${server.origin} now use ${scopeText(scope)} by default.`
      )
    })
).pipe(
  Command.withDescription(
    "Choose the org and project commands use when you don't pass --org and --project. Without an argument, pick from a list."
  ),
  Command.withExamples([
    {
      command: "pp use acme/website",
      description: "Use acme's website project"
    },
    {
      command: "pp use acme",
      description: "Use acme, with no default project"
    },
    { command: "pp use --clear", description: "Forget the default" }
  ])
)

const sourceText = (source: Source, kind: "server" | "org" | "project") => {
  switch (source) {
    case "flag":
      return `--${kind}`
    case "environment":
      return `PP_${kind.toUpperCase()}`
    case "default":
      return kind === "server" ? "default server" : "default from `pp use`"
    case "only":
      return kind === "org" ? "your only org" : "the org's only project"
  }
}

const settled = <E extends CliFailure, R>(
  effect: Effect.Effect<Sourced, E, R>
) =>
  effect.pipe(
    Effect.asSome,
    Effect.catchIf(
      (failure) => failure.code === ExitCode.usage,
      () => Effect.succeedNone
    )
  )

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const flags = yield* root
    const server = yield* currentServer
    const serverSource = Option.match(yield* serverChoice, {
      onNone: (): Source => "default",
      onSome: (choice) => choice.source
    })
    const org = yield* settled(resolveOrg(server))
    const project = Option.isSome(org)
      ? yield* settled(resolveProject(server, org))
      : yield* configuredProject(server, org)
    const part = (value: Option.Option<Sourced>, kind: "org" | "project") =>
      Option.match(value, {
        onNone: () => null,
        onSome: (sourced) => ({
          slug: sourced.value,
          source: sourceText(sourced.source, kind)
        })
      })
    if (flags.json) {
      return yield* printResult(
        {
          server: {
            origin: server.origin,
            source: sourceText(serverSource, "server")
          },
          user: server.user,
          org: part(org, "org"),
          project: part(project, "project")
        },
        true
      )
    }
    const line = (
      label: string,
      value: Option.Option<Sourced>,
      kind: "org" | "project",
      missing: string
    ) =>
      `${label.padEnd(9)}${Option.match(value, {
        onNone: () => missing,
        onSome: (sourced) =>
          `${sourced.value} (${sourceText(sourced.source, kind)})`
      })}`
    yield* Console.log(
      [
        `${"server".padEnd(9)}${server.origin} (${sourceText(serverSource, "server")})`,
        `${"account".padEnd(9)}${server.user.name} <${server.user.email}>`,
        line(
          "org",
          org,
          "org",
          "none: pass --org, or choose one with `pp use`"
        ),
        line(
          "project",
          project,
          "project",
          "none: pass --project, or choose one with `pp use`"
        )
      ].join("\n")
    )
  })
).pipe(
  Command.withDescription(
    "Show the server, account, org and project commands use, and where each comes from."
  )
)
