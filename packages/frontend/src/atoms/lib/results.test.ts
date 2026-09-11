import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { describe, expect, it } from "vitest"
import { Results } from "./results"

describe("Results.blocked", () => {
  it("returns undefined when everything succeeded", () => {
    expect(
      Results.blocked([AsyncResult.success(1), AsyncResult.success(2)])
    ).toBeUndefined()
  })

  it("returns the first non-success", () => {
    const initial = AsyncResult.initial<number>()
    expect(Results.blocked([AsyncResult.success(1), initial])).toBe(initial)
  })
})

describe("Results.meta", () => {
  it("is waiting when any part is waiting and takes the newest timestamp", () => {
    const older = AsyncResult.success(1, { timestamp: 10 })
    const newer = AsyncResult.success(2, { timestamp: 20, waiting: true })
    expect(Results.meta([older, newer])).toEqual({
      waiting: true,
      timestamp: 20
    })
  })

  it("is not waiting when every part settled", () => {
    const a = AsyncResult.success(1, { timestamp: 30 })
    const b = AsyncResult.success(2, { timestamp: 25 })
    expect(Results.meta([a, b])).toEqual({ waiting: false, timestamp: 30 })
  })
})
