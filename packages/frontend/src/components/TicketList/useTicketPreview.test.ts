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
})

it("closes the preview when the row that owns it closes", () => {
  const { result } = renderHook(() => useTicketPreview())
  act(() => result.current.onPreviewOpenChange(rowA, true))
  act(() => result.current.onPreviewOpenChange(rowA, false))
  expect(result.current.activePreviewId).toBe(null)
})

it("drops a stale preview when the pointer enters a different row", () => {
  const { result } = renderHook(() => useTicketPreview())
  act(() => result.current.onPreviewOpenChange(rowA, true))
  act(() => result.current.onPreviewPointerEnter(rowB))
  expect(result.current.activePreviewId).toBe(null)
})
