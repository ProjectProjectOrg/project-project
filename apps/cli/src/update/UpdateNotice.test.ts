import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as TestClock from "effect/testing/TestClock"

import { ServerStore } from "../servers/ServerStore"
import { fakeHttp } from "../testing"
import {
  type Notice,
  noticeFor,
  noticeText,
  UpdateNotice,
  updateNoticeLayer
} from "./UpdateNotice"

const origin = "https://pp.example.com"

describe("noticeFor", () => {
  it("recommends pp upgrade when the server runs another release", () => {
    expect(
      Option.map(
        noticeFor(origin, Option.some("v2026.11.02"), "2026.10.30"),
        noticeText
      )
    ).toEqual(
      Option.some(
        "https://pp.example.com runs pp v2026.11.02; you have 2026.10.30. Run `pp upgrade --server https://pp.example.com` to match it."
      )
    )
  })

  it("stays quiet when pp matches, or the server has no release", () => {
    expect(noticeFor(origin, Option.some("v2026.10.30"), "2026.10.30")).toEqual(
      Option.none()
    )
    expect(noticeFor(origin, Option.none(), "2026.10.30")).toEqual(
      Option.none()
    )
  })
})

const withConfigHome = <A, E>(
  run: (
    noticeIn: (build: string) => Effect.Effect<Option.Option<Notice>>
  ) => Effect.Effect<A, E>,
  asked: Array<string>,
  failing = false
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const home = yield* fs.makeTempDirectoryScoped()
    const services = Layer.mergeAll(
      ServerStore.layer,
      fakeHttp((url) => {
        asked.push(url.pathname)
        return failing
          ? new Response("unavailable", { status: 503 })
          : Response.json({ version: "v2026.11.02" })
      })
    ).pipe(
      Layer.provideMerge(BunServices.layer),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ XDG_CONFIG_HOME: home })
        )
      )
    )
    const noticeIn = (build: string) =>
      Effect.gen(function* () {
        const updates = yield* UpdateNotice
        yield* updates.check(origin)
        return yield* updates.notice
      }).pipe(
        Effect.provide(
          updateNoticeLayer(build).pipe(Layer.provideMerge(services))
        ),
        Effect.orDie
      )
    yield* fs.makeDirectory(`${home}/pp`, { recursive: true })
    return yield* run(noticeIn)
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer))

describe("update notice", () => {
  it.effect("asks the server once a day and remembers the answer", () => {
    const asked: Array<string> = []
    return withConfigHome(
      (noticeIn) =>
        Effect.gen(function* () {
          const first = yield* noticeIn("2026.10.30")
          expect(noticeText(Option.getOrThrow(first))).toContain("pp upgrade")
          expect(yield* noticeIn("2026.10.30")).toEqual(first)
          expect(asked).toEqual(["/api/cli/release"])
          yield* TestClock.adjust("25 hours")
          yield* noticeIn("2026.10.30")
          expect(asked).toEqual(["/api/cli/release", "/api/cli/release"])
        }),
      asked
    )
  })

  it.effect("never checks from a build run from source", () => {
    const asked: Array<string> = []
    return withConfigHome(
      (noticeIn) =>
        Effect.gen(function* () {
          expect(yield* noticeIn("dev")).toEqual(Option.none())
          expect(asked).toEqual([])
        }),
      asked
    )
  })

  it.effect("waits an hour before asking a failing server again", () => {
    const asked: Array<string> = []
    return withConfigHome(
      (noticeIn) =>
        Effect.gen(function* () {
          expect(yield* noticeIn("2026.10.30")).toEqual(Option.none())
          yield* TestClock.adjust("30 minutes")
          yield* noticeIn("2026.10.30")
          expect(asked).toHaveLength(1)
          yield* TestClock.adjust("31 minutes")
          yield* noticeIn("2026.10.30")
          expect(asked).toHaveLength(2)
        }),
      asked,
      true
    )
  })
})
