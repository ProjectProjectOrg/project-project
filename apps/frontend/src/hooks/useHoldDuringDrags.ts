import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { useEffect, useState } from "react"

import { useHoldInteraction } from "./useHoldInteraction"

export function useHoldDuringDrags() {
  const [dragging, setDragging] = useState(false)
  useHoldInteraction(dragging)
  useEffect(
    () =>
      monitorForElements({
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false)
      }),
    []
  )
}
