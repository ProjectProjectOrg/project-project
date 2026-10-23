import { it } from "@effect/vitest"
import { EverhourError, EverhourProjectAccessDenied } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { afterEach, describe, expect, vi } from "vitest"

import { Everhour } from "./Everhour"
import { EverhourLive } from "./EverhourLive"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

const rateLimited = (retryAfterSeconds: number) =>
  new Response(JSON.stringify({ code: 429, message: "Too Many Requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds)
    }
  })

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

let fetchImplementation: FetchImplementation = () =>
  Promise.reject(new Error("fetch implementation not installed"))

const stubFetch = (implementation: FetchImplementation) => {
  fetchImplementation = implementation
}

const FetchLive = Layer.succeed(
  FetchHttpClient.Fetch,
  Object.assign(
    (input: string | URL | Request, init?: RequestInit) =>
      fetchImplementation(input, init),
    { preconnect: () => undefined }
  )
)

describe("EverhourLive response decoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.effect("maps a valid user response", () =>
    Effect.gen(function* () {
      stubFetch(
        vi.fn(async () =>
          jsonResponse({ id: 42, name: "Luuk", email: "luuk@example.com" })
        )
      )
      const everhour = yield* Everhour
      const user = yield* everhour.getCurrentUser("api-key")
      expect(user).toEqual({
        id: "42",
        name: "Luuk",
        email: "luuk@example.com"
      })
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("rejects a malformed successful response", () =>
    Effect.gen(function* () {
      stubFetch(vi.fn(async () => jsonResponse({ id: null })))
      const everhour = yield* Everhour
      const error = yield* Effect.flip(everhour.getCurrentUser("api-key"))
      expect(Schema.is(EverhourError)(error)).toBe(true)
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("treats an omitted project user list as unknown, not empty", () =>
    Effect.gen(function* () {
      stubFetch(
        vi.fn(async () => jsonResponse({ id: "ev:1", name: "Website" }))
      )
      const everhour = yield* Everhour
      const project = yield* everhour.getProject("api-key", "ev:1")
      expect(project.users).toBeNull()
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("reports time on an unassigned project as access denied", () =>
    Effect.gen(function* () {
      stubFetch(
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                code: 400,
                message:
                  "Time tracking is limited, since task #7197217677721262 belongs to the projects you don't have access to",
                errorType: "task_provider_no_task_access"
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            )
        )
      )
      const everhour = yield* Everhour
      const error = yield* Effect.flip(
        everhour.addTime("api-key", {
          task: "ev:197217677721262",
          time: 60,
          date: "2026-10-23"
        })
      )
      expect(Schema.is(EverhourProjectAccessDenied)(error)).toBe(true)
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("retries a rate-limited request after Retry-After", () =>
    Effect.gen(function* () {
      const fetch = vi
        .fn<FetchImplementation>()
        .mockResolvedValueOnce(rateLimited(2))
        .mockResolvedValueOnce(
          jsonResponse({ id: 42, name: "Luuk", email: null })
        )
      stubFetch(fetch)
      const everhour = yield* Everhour
      const pending = yield* everhour
        .getCurrentUser("api-key")
        .pipe(Effect.forkChild)
      yield* TestClock.adjust("1 second")
      expect(fetch).toHaveBeenCalledTimes(1)
      yield* TestClock.adjust("2 seconds")
      const user = yield* Fiber.join(pending)
      expect(user.id).toBe("42")
      expect(fetch).toHaveBeenCalledTimes(2)
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("fails at once when Everhour asks to wait over ten seconds", () =>
    Effect.gen(function* () {
      const fetch = vi.fn<FetchImplementation>(async () => rateLimited(30))
      stubFetch(fetch)
      const everhour = yield* Everhour
      const error = yield* Effect.flip(everhour.getCurrentUser("api-key"))
      expect(error).toMatchObject({
        _tag: "EverhourRateLimited",
        retryAfterSeconds: 30
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("returns the record a stopped timer saved, with its history", () =>
    Effect.gen(function* () {
      stubFetch(
        vi.fn(async () =>
          jsonResponse({
            status: "stopped",
            taskTime: {
              user: 1447327,
              history: [
                { id: 473389371, time: 60, previousTime: 0, action: "TIMER" }
              ],
              id: 277062174,
              date: "2026-10-23",
              time: 60,
              comment: "T-1 — Fix the thing"
            }
          })
        )
      )
      const everhour = yield* Everhour
      const record = yield* everhour.stopTimer("api-key")
      expect(record).toEqual({
        id: "277062174",
        taskId: null,
        userId: "1447327",
        seconds: 60,
        date: "2026-10-23",
        comment: "T-1 — Fix the thing",
        history: [{ id: "473389371", seconds: 60 }]
      })
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )
  it.effect("recovers omitted history for saved time and stopped timers", () =>
    Effect.gen(function* () {
      const wire = { id: 277062174, user: 42, date: "2026-10-23", time: 60 }
      const everhour = yield* Everhour
      for (const operation of ["log", "stop"] as const) {
        const fetch = vi
          .fn<FetchImplementation>()
          .mockResolvedValueOnce(
            jsonResponse(operation === "log" ? wire : { taskTime: wire })
          )
          .mockResolvedValueOnce(
            jsonResponse([
              { ...wire, history: [{ id: 101, time: 60, previousTime: 0 }] }
            ])
          )
        stubFetch(fetch)
        const record = yield* operation === "log"
          ? everhour.addTime("api-key", {
              task: "task",
              time: 60,
              date: wire.date
            })
          : everhour.stopTimer("api-key")
        expect(record?.history).toEqual([{ id: "101", seconds: 60 }])
        expect(fetch).toHaveBeenCalledTimes(2)
        const request = fetch.mock.calls[1]?.[0]
        expect(
          request instanceof Request ? request.url : request?.toString()
        ).toContain(
          "/users/42/time?from=2026-10-23&to=2026-10-23&limit=100&page=1"
        )
      }
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("fails when a saved record's history cannot be recovered", () =>
    Effect.gen(function* () {
      const wire = { id: 277062174, user: 42, date: "2026-10-23", time: 60 }
      const everhour = yield* Everhour
      for (const operation of ["log", "stop"] as const) {
        stubFetch(
          vi
            .fn<FetchImplementation>()
            .mockResolvedValueOnce(
              jsonResponse(operation === "log" ? wire : { taskTime: wire })
            )
            .mockResolvedValueOnce(jsonResponse([wire]))
        )
        const error = yield* Effect.flip(
          operation === "log"
            ? everhour.addTime("api-key", {
                task: "task",
                time: 60,
                date: wire.date
              })
            : everhour.stopTimer("api-key")
        )
        expect(error).toMatchObject({
          _tag: "EverhourError",
          message: "Everhour did not return history for the saved time record"
        })
      }
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )
  it.effect("finds saved history past the first page of a user's day", () =>
    Effect.gen(function* () {
      const wire = { id: 277062174, user: 42, date: "2026-10-23", time: 60 }
      const fetch = vi
        .fn<FetchImplementation>()
        .mockResolvedValueOnce(jsonResponse(wire))
        .mockResolvedValueOnce(
          jsonResponse(
            Array.from({ length: 100 }, (_, index) => ({
              ...wire,
              id: index + 1
            }))
          )
        )
        .mockResolvedValueOnce(
          jsonResponse([
            { ...wire, history: [{ id: 101, time: 60, previousTime: 0 }] }
          ])
        )
      stubFetch(fetch)
      const everhour = yield* Everhour
      const record = yield* everhour.addTime("api-key", {
        task: "task",
        time: 60,
        date: wire.date
      })
      expect(record.history).toEqual([{ id: "101", seconds: 60 }])
      expect(fetch).toHaveBeenCalledTimes(3)
      const request = fetch.mock.calls[2]?.[0]
      expect(
        request instanceof Request ? request.url : request?.toString()
      ).toContain("page=2")
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )
  it.effect(
    "recovers the entry from the mutation snapshot when a later write appears",
    () =>
      Effect.gen(function* () {
        const wire = { id: 277062174, user: 42, date: "2026-10-23", time: 60 }
        const everhour = yield* Everhour
        for (const operation of ["log", "stop"] as const) {
          stubFetch(
            vi
              .fn<FetchImplementation>()
              .mockResolvedValueOnce(
                jsonResponse(operation === "log" ? wire : { taskTime: wire })
              )
              .mockResolvedValueOnce(
                jsonResponse([
                  {
                    ...wire,
                    time: 180,
                    history: [
                      { id: 101, time: 60, previousTime: 0 },
                      { id: 102, time: 120, previousTime: 60 }
                    ]
                  }
                ])
              )
          )
          const record = yield* operation === "log"
            ? everhour.addTime("api-key", {
                task: "task",
                time: 60,
                date: wire.date
              })
            : everhour.stopTimer("api-key")
          expect(record?.seconds).toBe(60)
          expect(record?.history).toEqual([{ id: "101", seconds: 60 }])
        }
      }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect(
    "rejects recovery when several entries match the mutation total",
    () =>
      Effect.gen(function* () {
        const wire = { id: 277062174, user: 42, date: "2026-10-23", time: 60 }
        stubFetch(
          vi
            .fn<FetchImplementation>()
            .mockResolvedValueOnce(jsonResponse(wire))
            .mockResolvedValueOnce(
              jsonResponse([
                {
                  ...wire,
                  history: [
                    { id: 101, time: 60, previousTime: 0 },
                    { id: 102, time: -60, previousTime: 60 },
                    { id: 103, time: 60, previousTime: 0 }
                  ]
                }
              ])
            )
        )
        const everhour = yield* Everhour
        const error = yield* Effect.flip(
          everhour.addTime("api-key", {
            task: "task",
            time: 60,
            date: wire.date
          })
        )
        expect(error._tag).toBe("EverhourError")
      }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )
})
