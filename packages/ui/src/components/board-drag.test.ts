// @vitest-environment jsdom
import {
  draggable,
  dropTargetForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { cleanup, fireEvent, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
  BoardCardDragData,
  BoardColumnDropData,
  useBoardCardDrop
} from "./board-drag"

afterEach(cleanup)

it("uses the latest committed board when a card is dropped after an update", () => {
  const card = document.createElement("div")
  const column = document.createElement("div")
  document.body.append(card, column)
  const stopDrag = draggable({
    element: card,
    getInitialData: () => BoardCardDragData.make({ id: "T-1", status: "todo" })
  })
  const stopDrop = dropTargetForElements({
    element: column,
    getData: () => BoardColumnDropData.make({ status: "done" })
  })
  const moved =
    vi.fn<(id: string, status: string, order: ReadonlyArray<string>) => void>()
  const { rerender } = renderHook(
    ({ order }) =>
      useBoardCardDrop(true, (source, target) =>
        moved(source.id, target.status, order)
      ),
    { initialProps: { order: ["T-2"] } }
  )
  const dataTransfer = {
    setData: () => {},
    setDragImage: () => {},
    types: new Array<string>()
  }
  try {
    fireEvent.dragStart(card, { dataTransfer })
    rerender({ order: ["T-2", "T-3"] })
    fireEvent.dragEnter(column, { dataTransfer })
    fireEvent.dragOver(column, { dataTransfer })
    fireEvent.drop(column, { dataTransfer })
    expect(moved).toHaveBeenCalledExactlyOnceWith("T-1", "done", ["T-2", "T-3"])
  } finally {
    stopDrop()
    stopDrag()
    card.remove()
    column.remove()
  }
})
