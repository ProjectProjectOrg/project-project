import * as Data from "effect/Data"

export type MergeConflict = Readonly<{
  line: number
  base: ReadonlyArray<string>
  mine: ReadonlyArray<string>
  theirs: ReadonlyArray<string>
}>

export type DescriptionMerge = Data.TaggedEnum<{
  Merged: { readonly body: string }
  Conflict: { readonly conflicts: ReadonlyArray<MergeConflict> }
}>

const { Merged, Conflict } = Data.taggedEnum<DescriptionMerge>()

type Side = "mine" | "theirs"

/** Base lines `[baseStart, baseEnd)` became side lines `[sideStart, sideEnd)`. */
type Hunk = Readonly<{
  side: Side
  baseStart: number
  baseEnd: number
  sideStart: number
  sideEnd: number
}>

const linesOf = (text: string): ReadonlyArray<string> => text.split("\n")

const sameLines = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>
): boolean => a.length === b.length && a.every((line, i) => line === b[i])

const diffHunks = (
  side: Side,
  base: ReadonlyArray<string>,
  other: ReadonlyArray<string>
): Array<Hunk> => {
  let prefix = 0
  while (
    prefix < base.length &&
    prefix < other.length &&
    base[prefix] === other[prefix]
  )
    prefix++
  let suffix = 0
  while (
    suffix < base.length - prefix &&
    suffix < other.length - prefix &&
    base[base.length - 1 - suffix] === other[other.length - 1 - suffix]
  )
    suffix++

  const n = base.length - prefix - suffix
  const m = other.length - prefix - suffix
  if (n === 0 && m === 0) return []

  const width = m + 1
  const lcs = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        base[prefix + i] === other[prefix + j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const hunks: Array<Hunk> = []
  let open: { baseStart: number; sideStart: number } | null = null
  const close = (i: number, j: number) => {
    if (open === null) return
    hunks.push({
      side,
      baseStart: prefix + open.baseStart,
      baseEnd: prefix + i,
      sideStart: prefix + open.sideStart,
      sideEnd: prefix + j
    })
    open = null
  }

  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && base[prefix + i] === other[prefix + j]) {
      close(i, j)
      i++
      j++
    } else {
      open ??= { baseStart: i, sideStart: j }
      if (
        j >= m ||
        (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
      )
        i++
      else j++
    }
  }
  close(n, m)
  return hunks
}

const sideLines = (
  lines: ReadonlyArray<string>,
  base: ReadonlyArray<string>,
  hunks: ReadonlyArray<Hunk>,
  start: number,
  end: number
): ReadonlyArray<string> => {
  const first = hunks[0]
  const last = hunks[hunks.length - 1]
  if (first === undefined || last === undefined) return base.slice(start, end)
  return lines.slice(
    first.sideStart - (first.baseStart - start),
    last.sideEnd + (end - last.baseEnd)
  )
}

export const mergeDescriptions = (
  base: string,
  mine: string,
  theirs: string
): DescriptionMerge => {
  if (mine === theirs || theirs === base) return Merged({ body: mine })
  if (mine === base) return Merged({ body: theirs })

  const baseLines = linesOf(base)
  const lines = { mine: linesOf(mine), theirs: linesOf(theirs) }
  const hunks = [
    ...diffHunks("mine", baseLines, lines.mine),
    ...diffHunks("theirs", baseLines, lines.theirs)
  ].toSorted((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd)

  const merged: Array<string> = []
  const conflicts: Array<MergeConflict> = []
  let copied = 0
  let next = 0

  while (next < hunks.length) {
    const first = hunks[next]
    const region = [first]
    const start = first.baseStart
    let end = first.baseEnd
    next++
    // Hunks that only touch the region's end stay separate.
    while (next < hunks.length) {
      const hunk = hunks[next]
      if (!(hunk.baseStart < end || hunk.baseStart === start)) break
      region.push(hunk)
      end = Math.max(end, hunk.baseEnd)
      next++
    }

    merged.push(...baseLines.slice(copied, start))
    copied = end

    const ofSide = (side: Side) => region.filter((hunk) => hunk.side === side)
    const mineLines = sideLines(
      lines.mine,
      baseLines,
      ofSide("mine"),
      start,
      end
    )
    const theirLines = sideLines(
      lines.theirs,
      baseLines,
      ofSide("theirs"),
      start,
      end
    )

    if (ofSide("theirs").length === 0 || sameLines(mineLines, theirLines))
      merged.push(...mineLines)
    else if (ofSide("mine").length === 0) merged.push(...theirLines)
    else
      conflicts.push({
        line: start,
        base: baseLines.slice(start, end),
        mine: mineLines,
        theirs: theirLines
      })
  }
  merged.push(...baseLines.slice(copied))

  return conflicts.length > 0
    ? Conflict({ conflicts })
    : Merged({ body: merged.join("\n") })
}
