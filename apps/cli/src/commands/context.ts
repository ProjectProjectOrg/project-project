import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { usage } from "../CliFailure"
import { originOf } from "../servers/origin"
import { ServerStore } from "../servers/ServerStore"
import { root } from "./root"

export const currentServer = Effect.gen(function* () {
  const flags = yield* root
  const origin = Option.flatMap(flags.server, originOf)
  if (Option.isSome(flags.server) && Option.isNone(origin)) {
    return yield* usage(`"${flags.server.value}" isn't a valid server address.`)
  }
  return yield* (yield* ServerStore).select(origin)
})

export const currentScope = Effect.gen(function* () {
  const flags = yield* root
  return { org: flags.org, project: flags.project }
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
          `This command needs ${flag === "org" ? "an org" : "a project"}. Pass --${flag} <slug>; \`pp ${flag}s list\` shows yours.`
        )
      )
  })
