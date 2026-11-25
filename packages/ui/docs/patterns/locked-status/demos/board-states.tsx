import { BoardColumns } from "@pp/ui/board-drag"
import type { ReactNode } from "react"

import { BOARD_START, LockedColumn } from "./board"

const columns = BOARD_START.filter(
  (column) => column.status === "review" || column.status === "done"
)

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <BoardColumns
        values={columns.map((column) => column.status)}
        reordering={false}
        onReorder={() => undefined}
        className="flex h-56 gap-3 p-1"
      >
        {children}
      </BoardColumns>
    </div>
  )
}

export default function BoardStates() {
  return (
    <div className="flex w-full flex-col gap-8 overflow-x-auto">
      <Row caption="At rest">
        {columns.map((column) => (
          <LockedColumn
            key={column.status}
            column={column}
            role="developer"
            forced={null}
          />
        ))}
      </Row>
      <Row caption="Developer dragging a card, pointer over In review">
        <LockedColumn column={columns[0]!} role="developer" forced="over" />
        <LockedColumn column={columns[1]!} role="developer" forced="dragging" />
      </Row>
      <Row caption="PM dragging a card">
        {columns.map((column) => (
          <LockedColumn
            key={column.status}
            column={column}
            role="pm"
            forced="pm-dragging"
          />
        ))}
      </Row>
    </div>
  )
}
