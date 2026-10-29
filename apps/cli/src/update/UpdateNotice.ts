import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import type { HttpClient } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"

import { ServerStore } from "../servers/ServerStore"
import { serverRelease } from "./serverRelease"

const CHECK_EVERY_MS = 24 * 60 * 60 * 1000

const UpdateChecks = Schema.Record(
  Schema.String,
  Schema.Struct({
    checkedAt: Schema.Finite,
    version: Schema.NullOr(Schema.String)
  })
)
type UpdateChecks = typeof UpdateChecks.Type

const UpdateChecksJson = Schema.fromJsonString(UpdateChecks, { space: 2 })
const decodeChecks = Schema.decodeUnknownEffect(UpdateChecksJson)
const encodeChecks = Schema.encodeEffect(UpdateChecksJson)

export type UpdateNoticeShape = Readonly<{
  check: (origin: string) => Effect.Effect<void>
  notice: Effect.Effect<Option.Option<string>>
}>

export const UpdateNotice = Context.Reference<UpdateNoticeShape>(
  "@pp/cli/update/UpdateNotice",
  {
    defaultValue: () => ({
      check: () => Effect.void,
      notice: Effect.succeedNone
    })
  }
)

export const noticeFor = (
  origin: string,
  release: Option.Option<string>,
  build: string
) =>
  Option.flatMap(release, (tag) =>
    tag.replace(/^v/, "") === build
      ? Option.none()
      : Option.some(
          `${origin} runs pp ${tag}; you have ${build}. Run \`pp upgrade --server ${origin}\` to match it.`
        )
  )

const releaseFor = (origin: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = path.join(
      path.dirname((yield* ServerStore).file),
      "update-checks.json"
    )
    const checks: UpdateChecks = yield* fs.readFileString(file).pipe(
      Effect.flatMap(decodeChecks),
      Effect.orElseSucceed((): UpdateChecks => ({}))
    )
    const now = yield* Clock.currentTimeMillis
    const cached = checks[origin]
    if (cached !== undefined && now - cached.checkedAt < CHECK_EVERY_MS) {
      return Option.fromNullishOr(cached.version)
    }
    const release = yield* serverRelease(origin).pipe(
      Effect.timeoutOrElse({
        duration: "2 seconds",
        orElse: () => Effect.fail("timed out")
      })
    )
    yield* encodeChecks({
      ...checks,
      [origin]: { checkedAt: now, version: Option.getOrNull(release) }
    }).pipe(
      Effect.flatMap((text) => fs.writeFileString(file, text)),
      Effect.ignore
    )
    return release
  })

const skipped = Config.option(Config.String("PP_NO_UPDATE_CHECK")).pipe(
  Config.map(Option.exists((value) => value.trim() !== ""))
)

export const updateNoticeLayer = (build: string) =>
  Layer.effect(
    UpdateNotice,
    Effect.gen(function* () {
      if (build === "dev" || (yield* skipped)) {
        return yield* UpdateNotice
      }
      const services = yield* Effect.context<
        FileSystem.FileSystem | Path.Path | ServerStore | HttpClient.HttpClient
      >()
      const running = yield* Ref.make(
        Option.none<Fiber.Fiber<Option.Option<string>>>()
      )
      const notice: UpdateNoticeShape = {
        check: (origin) =>
          Effect.gen(function* () {
            if (Option.isSome(yield* Ref.get(running))) return
            const fiber = yield* releaseFor(origin).pipe(
              Effect.map((release) => noticeFor(origin, release, build)),
              Effect.orElseSucceed(() => Option.none<string>()),
              Effect.provideContext(services),
              Effect.forkDetach
            )
            yield* Ref.set(running, Option.some(fiber))
          }),
        notice: Effect.flatMap(
          Ref.get(running),
          Option.match({
            onNone: () => Effect.succeedNone,
            onSome: (fiber) =>
              Fiber.join(fiber).pipe(
                Effect.timeoutOrElse({
                  duration: "500 millis",
                  orElse: () => Effect.succeedNone
                })
              )
          })
        )
      }
      return notice
    })
  )
