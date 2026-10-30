import * as Cause from "effect/Cause"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { describe, expect, it } from "vitest"

import { staleSuccess } from "./staleSuccess"

describe("staleSuccess", () => {
  const loaded = AsyncResult.success(["T-1"])

  it("returns the last loaded value when a refetch failed", () => {
    const failed = AsyncResult.failure(Cause.fail("offline"), {
      previousSuccess: Option.some(loaded)
    })
    expect(staleSuccess(failed)).toEqual(Option.some(loaded))
  })

  it("returns nothing when the first load failed", () => {
    expect(staleSuccess(AsyncResult.failure(Cause.fail("offline")))).toEqual(
      Option.none()
    )
  })

  it("returns nothing for loaded and loading results", () => {
    expect(staleSuccess(loaded)).toEqual(Option.none())
    expect(staleSuccess(AsyncResult.initial())).toEqual(Option.none())
  })
})
