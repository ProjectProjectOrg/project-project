import type { ReactNode } from "react"
export type StagedLine = Readonly<{
  key: string
  count: number
  change: ReactNode
}>

// How many tickets a pick changes (each is on one line), or, before
// anything is staged, the whole selection.
export const stagedCount = (
  lines: ReadonlyArray<StagedLine>,
  selected: number
) =>
  lines.length === 0
    ? selected
    : lines.reduce((sum, line) => sum + line.count, 0)
