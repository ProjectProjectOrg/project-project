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
  forward,
  phase
}: Readonly<{
  offset: number
  height: number
  stride: number
  count: number
  forward: boolean
  phase: "mount" | "scroll" | "rest"
}>) {
  if (count === 0) return emptyWindow
  const viewport = Math.ceil(height / stride)
  const trailing = Math.min(BEHIND, viewport)
  const first = Math.floor(offset / stride)
  const end = Math.ceil((offset + height) / stride)
  const behind = Math.max(0, forward ? first : count - end)
  const unused = Math.max(0, trailing - behind)
  const guard = {
    mount: viewport,
    scroll: viewport * 2 + unused,
    rest: Math.ceil(viewport * 1.5)
  }
  const ahead = Math.min(AHEAD, guard[phase])
  return {
    start: Math.min(
      count - 1,
      Math.max(0, first - (forward ? trailing : ahead))
    ),
    end: Math.max(1, Math.min(count, end + (forward ? ahead : trailing)))
  }
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
