import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import type { DragLocationHistory } from "@atlaskit/pragmatic-drag-and-drop/types"
import type { Ticket } from "@pp/shared"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { isRowDragData, isSectionDropData } from "./ListRowDrag"
import { RowDragPreview } from "./RowDragPreview"

const GRAB_X = 24
const MAX_GRAB_Y = 24

type Drag = Readonly<{
  ticket: Pick<Ticket, "id" | "type" | "title" | "priority">
  section: string
  grabY: number
  x: number
  y: number
  landing: string | null
}>

const landingOf = (location: DragLocationHistory, section: string) => {
  const target = location.current.dropTargets
    .map(({ data }) => data)
    .find(isSectionDropData)
  return target === undefined || target.section === section
    ? null
    : target.label
}

export function ListDragOverlay() {
  const [drag, setDrag] = useState<Drag | null>(null)

  useEffect(() => {
    const follow = ({
      location
    }: Readonly<{ location: DragLocationHistory }>) =>
      setDrag(
        (current) =>
          current && {
            ...current,
            x: location.current.input.clientX,
            y: location.current.input.clientY,
            landing: landingOf(location, current.section)
          }
      )
    return monitorForElements({
      canMonitor: ({ source }) => isRowDragData(source.data),
      onDragStart: ({ source, location }) => {
        const data = source.data
        if (!isRowDragData(data)) return
        const { clientX, clientY } = location.current.input
        setDrag({
          ticket: {
            id: data.id,
            type: data.ticketType,
            title: data.title,
            priority: data.priority
          },
          section: data.section,
          grabY: Math.min(
            MAX_GRAB_Y,
            clientY - source.element.getBoundingClientRect().top
          ),
          x: clientX,
          y: clientY,
          landing: null
        })
      },
      onDrag: follow,
      onDropTargetChange: follow,
      onDrop: () => setDrag(null)
    })
  }, [])

  if (drag === null) return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-50"
      style={{
        transform: `translate(${drag.x - GRAB_X}px, ${drag.y - drag.grabY}px)`
      }}
    >
      <RowDragPreview ticket={drag.ticket} landing={drag.landing} />
    </div>,
    document.body
  )
}
