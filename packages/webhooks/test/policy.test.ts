import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  afterAttempt,
  backoffSeconds,
  classify,
  parseRetryAfter,
  type AttemptResult
} from "../src/policy"

const at = (value: string | number) =>
  DateTime.toDate(DateTime.makeUnsafe(value))

const response = (
  status: number,
  retryAfterSeconds: number | null = null
): AttemptResult => ({
  _tag: "Response",
  status,
  retryAfterSeconds,
  excerpt: null
})
const now = at("2026-11-01T12:00:00Z")
const healthy = { failureCount: 0, failingSince: null, goneCount: 0 }

describe("classify", () => {
  it.each([
    [200, "delivered"],
    [202, "delivered"],
    [204, "delivered"],
    [408, "pending"],
    [429, "pending"],
    [500, "pending"],
    [503, "pending"],
    [301, "failed"],
    [400, "failed"],
    [401, "failed"],
    [404, "failed"],
    [409, "failed"],
    [410, "failed"],
    [413, "failed"]
  ] as const)("HTTP %i is %s", (status, state) => {
    expect(classify(response(status)).state).toBe(state)
  })

  it("marks 404 and 410 as gone", () => {
    expect(classify(response(404)).gone).toBe(true)
    expect(classify(response(410)).gone).toBe(true)
    expect(classify(response(401)).gone).toBe(false)
  })

  it("retries network failures but not blocked addresses", () => {
    expect(classify({ _tag: "Failure", reason: "timeout" }).state).toBe(
      "pending"
    )
    expect(classify({ _tag: "Failure", reason: "connection" }).state).toBe(
      "pending"
    )
    expect(classify({ _tag: "Failure", reason: "blocked_address" }).state).toBe(
      "failed"
    )
  })
})

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("120", now)).toBe(120)
    expect(parseRetryAfter("Sun, 01 Nov 2026 12:05:00 GMT", now)).toBe(300)
    expect(parseRetryAfter("soon", now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })

  it("caps the wait at the maximum delivery age", () => {
    expect(parseRetryAfter("999999", now)).toBe(86_400)
  })
})

describe("afterAttempt", () => {
  it("resets the endpoint and keeps the send floor after a success", () => {
    const update = afterAttempt(
      { failureCount: 4, failingSince: now, goneCount: 2 },
      classify(response(200)),
      now
    )
    expect(update).toEqual({
      failureCount: 0,
      failingSince: null,
      goneCount: 0,
      nextAttemptAt: at(now.getTime() + 1000),
      lastSuccessAt: now,
      disable: null
    })
  })

  it("backs off exponentially per endpoint up to an hour", () => {
    expect([1, 2, 3, 8, 9, 20].map(backoffSeconds)).toEqual([
      10, 20, 40, 1280, 2560, 3600
    ])
    const update = afterAttempt(healthy, classify(response(503)), now)
    expect(update.failureCount).toBe(1)
    expect(update.failingSince).toEqual(now)
    expect(update.nextAttemptAt).toEqual(at(now.getTime() + 10_000))
  })

  it("honours Retry-After beyond the backoff cap", () => {
    const update = afterAttempt(healthy, classify(response(429, 7200)), now)
    expect(update.nextAttemptAt).toEqual(at(now.getTime() + 7_200_000))
  })

  it("cools the endpoint down after a rejected delivery too", () => {
    const update = afterAttempt(healthy, classify(response(400)), now)
    expect(update.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime())
    expect(update.disable).toBeNull()
  })

  it("disables after three 404 or 410 responses in a row", () => {
    const second = afterAttempt(
      { failureCount: 1, failingSince: now, goneCount: 1 },
      classify(response(410)),
      now
    )
    expect(second.disable).toBeNull()
    expect(afterAttempt(second, classify(response(404)), now).disable).toBe(
      "gone"
    )
  })

  it("breaks the gone streak on another failure", () => {
    expect(
      afterAttempt(
        { failureCount: 2, failingSince: now, goneCount: 2 },
        classify(response(500)),
        now
      ).goneCount
    ).toBe(0)
  })

  it("disables after ten failures spanning six hours", () => {
    const since = at(now.getTime() - 6 * 60 * 60 * 1000)
    expect(
      afterAttempt(
        { failureCount: 9, failingSince: since, goneCount: 0 },
        classify(response(500)),
        now
      ).disable
    ).toBe("failing")
    expect(
      afterAttempt(
        { failureCount: 9, failingSince: now, goneCount: 0 },
        classify(response(500)),
        now
      ).disable
    ).toBeNull()
    expect(
      afterAttempt(
        { failureCount: 3, failingSince: since, goneCount: 0 },
        classify(response(500)),
        now
      ).disable
    ).toBeNull()
  })
})
