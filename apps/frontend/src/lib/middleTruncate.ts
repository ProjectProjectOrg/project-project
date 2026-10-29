const DEFAULT_TAIL = 10
const MAX_SEGMENT_TAIL = 16

export type MiddleTruncateSplit = Readonly<{ head: string; tail: string }>

const segmentTail = (chars: ReadonlyArray<string>): number | null => {
  const slash = chars.lastIndexOf("/")
  if (slash > 0 && slash < chars.length - 1) {
    const segment = chars.length - slash - 1
    return segment <= MAX_SEGMENT_TAIL ? segment : DEFAULT_TAIL
  }
  const space = chars.findIndex(
    (char, index) =>
      char === " " && index > 0 && chars.length - index - 1 <= MAX_SEGMENT_TAIL
  )
  return space > 0 && space < chars.length - 1 ? chars.length - space : null
}

export const splitForMiddleTruncate = (
  value: string,
  tail?: number
): MiddleTruncateSplit | null => {
  const chars = Array.from(value)
  const keep = tail ?? segmentTail(chars) ?? DEFAULT_TAIL
  if (keep <= 0 || chars.length <= keep + 4) return null
  const cut = chars.length - keep
  return { head: chars.slice(0, cut).join(""), tail: chars.slice(cut).join("") }
}
