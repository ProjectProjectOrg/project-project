const DEFAULT_TAIL = 10
const MAX_SEGMENT_TAIL = 16

export type MiddleTruncateSplit = Readonly<{ head: string; tail: string }>

export const splitForMiddleTruncate = (
  value: string,
  tail?: number
): MiddleTruncateSplit | null => {
  const chars = Array.from(value)
  let keep = tail ?? DEFAULT_TAIL
  if (tail === undefined) {
    const slash = chars.lastIndexOf("/")
    if (slash > 0 && slash < chars.length - 1) {
      const segment = chars.length - slash - 1
      keep = segment <= MAX_SEGMENT_TAIL ? segment : DEFAULT_TAIL
    }
  }
  if (keep <= 0 || chars.length <= keep + 4) return null
  const cut = chars.length - keep
  return { head: chars.slice(0, cut).join(""), tail: chars.slice(cut).join("") }
}
