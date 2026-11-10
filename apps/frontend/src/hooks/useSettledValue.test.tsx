import { cleanup, renderHook } from "@testing-library/react"
import * as Result from "effect/reactivity/AsyncResult"
import { afterEach, expect, it } from "vitest"

import { useSettledValue } from "./useSettledValue"

afterEach(cleanup)

it("keeps the last loaded value while the next one loads", () => {
  const { result, rerender } = renderHook<
    string,
    { value: Result.AsyncResult<string> }
  >(({ value }) => useSettledValue(value, "none"), {
    initialProps: { value: Result.success("first") }
  })
  expect(result.current).toBe("first")
  rerender({ value: Result.initial(true) })
  expect(result.current).toBe("first")
  rerender({ value: Result.success("second") })
  expect(result.current).toBe("second")
})
