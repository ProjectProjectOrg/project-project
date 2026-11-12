import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useKeyboardMode } from "./useKeyboardMode"

afterEach(cleanup)

const mouseMove = () => {
  const event = new MouseEvent("pointermove", { bubbles: true })
  Object.defineProperties(event, {
    pointerType: { value: "mouse" },
    movementX: { value: 4 }
  })
  document.dispatchEvent(event)
}

it("doesn't treat focus moved by Tab as placed by keyboard navigation", () => {
  const root = { current: document.createElement("div") }
  const onMouseMove =
    vi.fn<(event: PointerEvent, wasNavigating: boolean) => void>()
  const { result } = renderHook(() => useKeyboardMode(root, onMouseMove))
  result.current()
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }))
  mouseMove()
  expect(onMouseMove).toHaveBeenCalledWith(expect.anything(), false)
})
