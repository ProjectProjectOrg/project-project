export type RowRange = Readonly<{ start: number; end: number }>

export const noRows: RowRange = { start: 0, end: 0 }

const BATCH = 8

export function visibleRows({
  top,
  height,
  overscan,
  stride,
  count
}: Readonly<{
  top: number
  height: number
  overscan: number
  stride: number
  count: number
}>) {
  const from = Math.floor((top - overscan) / stride / BATCH) * BATCH
  const to = Math.ceil((top + height + overscan) / stride / BATCH) * BATCH
  const start = Math.max(0, Math.min(from, count))
  const end = Math.max(start, Math.min(to, count))
  return start === end ? noRows : ({ start, end } satisfies RowRange)
}
