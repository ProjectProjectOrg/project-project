import { act, renderHook } from "@testing-library/react"
import { expect, it } from "vitest"
import * as Schema from "effect/Schema"
import { TicketId } from "@projectproject/shared"
import { useTicketPreview } from "./useTicketPreview"

const decodeTicketId = Schema.decodeSync(TicketId)
const rowA = decodeTicketId("T-1")
const rowB = decodeTicketId("T-2")

it("keeps the hovered row's preview when a different row closes", () => {
  const { result } = renderHook(() => useTicketPreview())
  act(() => result.current.onPreviewOpenChange(rowA, true))
  act(() => result.current.onPreviewOpenChange(rowB, false))
  expect(result.current.activePreviewId).toBe(rowA)
  expect(result.current.mountedPreviewId).toBe(rowA)
})

it("unmounts whichever row owns the preview on dismiss", () => {
  const { result } = renderHook(() => useTicketPreview())
  act(() => result.current.onPreviewOpenChange(rowA, true))
  act(() => result.current.onPreviewDismiss())
  expect(result.current.activePreviewId).toBe(null)
  expect(result.current.mountedPreviewId).toBe(null)
})

it("leaves the card mounted after hover-out so the exit animation can run", () => {
  const { result } = renderHook(() => useTicketPreview())
  act(() => result.current.onPreviewOpenChange(rowA, true))
  act(() => result.current.onPreviewOpenChange(rowA, false))
  expect(result.current.activePreviewId).toBe(null)
  expect(result.current.mountedPreviewId).toBe(rowA)
})
