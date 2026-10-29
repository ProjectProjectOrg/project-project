import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { usage } from "../CliFailure"
import { readProjectConfig } from "../project/ProjectConfig"
import { originOf } from "../servers/origin"
import { ServerStore } from "../servers/ServerStore"
import { root } from "./root"

export const currentServer = Effect.gen(function* () {
  const flags = yield* root
  const project = yield* readProjectConfig
  const preferred = Option.orElse(flags.server, () =>
    Option.flatMap(project, (config) => Option.fromNullishOr(config.server))
  )
  const origin = Option.flatMap(preferred, originOf)
  if (Option.isSome(preferred) && Option.isNone(origin)) {
    return yield* usage(`"${preferred.value}" isn't a valid server address.`)
  }
  return yield* (yield* ServerStore).select(origin)
})

export const currentScope = Effect.gen(function* () {
  const flags = yield* root
  const project = yield* readProjectConfig
  return {
    org: Option.orElse(flags.org, () =>
      Option.map(project, (config) => config.org)
    ),
    project: Option.orElse(flags.project, () =>
      Option.flatMap(project, (config) => Option.fromNullishOr(config.project))
    )
  }
})

export const requireSlug = (
  slug: Option.Option<string>,
  flag: "org" | "project"
) =>
  Option.match(slug, {
    onSome: Effect.succeed,
    onNone: () =>
      Effect.fail(
        usage(
          `This command needs ${flag === "org" ? "an org" : "a project"}. Pass --${flag} <slug>, or run \`pp init\` in your repository.`
        )
      )
  })
