import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { useMountedRef } from "./useMountedRef"

afterEach(cleanup)

it("tracks mounting and unmounting through StrictMode replay", () => {
  const { result, unmount } = renderHook(useMountedRef, {
    reactStrictMode: true
  })
  expect(result.current.current).toBe(true)
  unmount()
  expect(result.current.current).toBe(false)
})
