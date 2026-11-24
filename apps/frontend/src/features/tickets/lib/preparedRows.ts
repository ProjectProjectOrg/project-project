type RowWindow = Readonly<{ start: number; end: number }>

export const emptyWindow: RowWindow = { start: 0, end: 0 }

const AHEAD = 64
const BEHIND = 16
const BATCH = 3

export function requiredRows({
  offset,
  height,
  stride,
  count,
  forward
}: Readonly<{
  offset: number
  height: number
  stride: number
  count: number
  forward: boolean
}>) {
  if (count === 0) return emptyWindow
  const visible = Math.ceil(height / stride) + 1
  const size = Math.min(count, visible + BATCH)
  const first = Math.floor(offset / stride) - (forward ? 0 : BATCH)
  const start = Math.max(0, Math.min(first, count - size))
  return { start, end: start + size }
}

export function preparedRows(
  mounted: RowWindow,
  required: RowWindow,
  count: number,
  forward: boolean,
  idle: boolean
) {
  if (
    !idle &&
    mounted.end <= count &&
    mounted.start <= required.start &&
    mounted.end >= required.end
  )
    return mounted

  const overlaps = mounted.start < required.end && required.start < mounted.end
  let start = overlaps
    ? Math.min(required.start, mounted.start)
    : required.start
  let end = overlaps
    ? Math.min(count, Math.max(required.end, mounted.end))
    : required.end

  const first = Math.max(0, required.start - (forward ? BEHIND : AHEAD))
  const last = Math.min(count, required.end + (forward ? AHEAD : BEHIND))
  if (idle) {
    if (forward && end < last) end = Math.min(last, end + BATCH)
    else if (start > first) start = Math.max(first, start - BATCH)
    else if (end < last) end = Math.min(last, end + BATCH)
  }
  if (start < first - BATCH) start = first
  if (end > last + BATCH) end = last
  return start === mounted.start && end === mounted.end
    ? mounted
    : { start, end }
}
