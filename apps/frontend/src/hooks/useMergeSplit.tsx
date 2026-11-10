import { AnimatePresence, motion } from "motion/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import type { ItemRect } from "@/hooks/useFluidHover"
import { spring } from "@/lib/springs"

const mergeSpring = spring.moderate
const cornerDelay = 0.07
const convergeMs = (mergeSpring.duration + cornerDelay) * 1000 + 80
const splitMs = mergeSpring.duration * 1000 + 80

type Radii = readonly [number, number, number, number]

type Rect = {
  top: number
  left: number
  width: number
  height: number
}

export type SelectionBlock = Rect & {
  key: string
  radii: Radii
  instant: boolean
  exitInstant: boolean
  delayCorners: boolean
  cornerDelay?: number
  opacity?: number
  enterFrom?: Readonly<{ top: number; height: number; radii: Radii }>
}

export type Run = Readonly<{ start: number; end: number; id: number }>

type RunIds = Readonly<{
  runs: ReadonlyArray<Run>
  byRow: ReadonlyMap<number, number>
  lastId: number
}>

function assignRunIds(
  sorted: ReadonlyArray<number>,
  prev: ReadonlyMap<number, number>,
  lastId: number
): RunIds {
  const spans: Array<{ start: number; end: number }> = []
  for (const idx of sorted) {
    const last = spans.at(-1)
    if (last && idx === last.end + 1) last.end = idx
    else spans.push({ start: idx, end: idx })
  }
  const usedIds = new Set<number>()
  const byRow = new Map<number, number>()
  let nextId = lastId
  const runs = spans.map((span) => {
    let stableId: number | null = null
    for (let i = span.start; i <= span.end; i++) {
      const prevId = prev.get(i)
      if (prevId !== undefined && !usedIds.has(prevId)) {
        stableId = prevId
        break
      }
    }
    const id = stableId ?? ++nextId
    usedIds.add(id)
    for (let i = span.start; i <= span.end; i++) byRow.set(i, id)
    return { ...span, id }
  })
  return { runs, byRow, lastId: nextId }
}

export function useSelectionRuns(
  checkedIndices: ReadonlyArray<number>
): ReadonlyArray<Run> {
  const sorted = [...checkedIndices].toSorted((a, b) => a - b)
  const key = sorted.join(",")
  const [ids, setIds] = useState(() => ({
    key,
    ...assignRunIds(sorted, new Map(), 0)
  }))
  if (ids.key === key) return ids.runs
  const next = { key, ...assignRunIds(sorted, ids.byRow, ids.lastId) }
  setIds(next)
  return next.runs
}

type Boundary = Readonly<{
  tid: number
  kind: "merge" | "split"
  survivorId: number
  otherId: number
  gapIndex: number
  phase: "converge" | "commit" | "splitIn" | "diverge"
}>

function bridgePair(outer: Run, runs: ReadonlyArray<Run>) {
  const inside = runs
    .filter((r) => r.start >= outer.start && r.end <= outer.end)
    .toSorted((a, b) => a.start - b.start)
  if (inside.length !== 2) return null
  const [up, lo] = inside
  return lo.start === up.end + 2 ? { up, lo, gap: up.end + 1 } : null
}

function detectBoundaries(
  prev: ReadonlyArray<Run>,
  cur: ReadonlyArray<Run>,
  nextTid: () => number
): ReadonlyArray<Boundary> {
  const found: Array<Boundary> = []
  for (const c of cur) {
    const p = bridgePair(c, prev)
    if (p && (c.id === p.up.id || c.id === p.lo.id))
      found.push({
        tid: nextTid(),
        kind: "merge",
        survivorId: c.id,
        otherId: c.id === p.up.id ? p.lo.id : p.up.id,
        gapIndex: p.gap,
        phase: "converge"
      })
  }
  for (const p of prev) {
    const c = bridgePair(p, cur)
    if (c)
      found.push({
        tid: nextTid(),
        kind: "split",
        survivorId: c.up.id,
        otherId: c.lo.id,
        gapIndex: c.gap,
        phase: "splitIn"
      })
  }
  return found
}

function isStillValid(b: Boundary, cur: ReadonlyArray<Run>): boolean {
  if (b.kind === "merge")
    return cur.some(
      (c) => c.id === b.survivorId && b.gapIndex > c.start && b.gapIndex < c.end
    )
  return (
    cur.some((c) => c.id === b.survivorId && c.end === b.gapIndex - 1) &&
    cur.some((c) => c.id === b.otherId && c.start === b.gapIndex + 1)
  )
}

function settleBoundary(
  boundaries: ReadonlyArray<Boundary>,
  tid: number
): ReadonlyArray<Boundary> {
  if (!boundaries.some((x) => x.tid === tid)) return boundaries
  return boundaries.flatMap((x) =>
    x.tid !== tid
      ? [x]
      : x.kind === "merge"
        ? [{ ...x, phase: "commit" as const }]
        : []
  )
}

function useBoundaries(runs: ReadonlyArray<Run>): ReadonlyArray<Boundary> {
  const [boundaries, setBoundaries] = useState<ReadonlyArray<Boundary>>([])
  const prevRunsRef = useRef<ReadonlyArray<Run>>([])
  const tidRef = useRef(0)
  const timersRef = useRef(new Map<number, number>())
  const runsSig = runs.map((g) => `${g.id}:${g.start}-${g.end}`).join("|")
  const runsRef = useRef(runs)
  runsRef.current = runs

  useLayoutEffect(() => {
    const cur = runsRef.current
    const found = detectBoundaries(
      prevRunsRef.current,
      cur,
      () => ++tidRef.current
    )
    prevRunsRef.current = cur
    for (const b of found) {
      timersRef.current.set(
        b.tid,
        window.setTimeout(
          () => {
            timersRef.current.delete(b.tid)
            setBoundaries((bs) => settleBoundary(bs, b.tid))
          },
          b.kind === "merge" ? convergeMs : splitMs
        )
      )
    }
    setBoundaries((active) => {
      for (const b of active) {
        if (isStillValid(b, cur)) continue
        const timer = timersRef.current.get(b.tid)
        if (timer === undefined) continue
        window.clearTimeout(timer)
        timersRef.current.delete(b.tid)
      }
      return [...active.filter((b) => isStillValid(b, cur)), ...found]
    })
  }, [runsSig])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  useEffect(() => {
    if (!boundaries.some((b) => b.phase === "splitIn" || b.phase === "commit"))
      return
    const frame = requestAnimationFrame(() =>
      setBoundaries((bs) =>
        bs.flatMap((b) =>
          b.phase === "commit"
            ? []
            : [{ ...b, phase: b.phase === "splitIn" ? "diverge" : b.phase }]
        )
      )
    )
    return () => cancelAnimationFrame(frame)
  }, [boundaries])

  return boundaries
}

function rectOf(
  itemRects: ReadonlyArray<ItemRect | undefined>,
  start: number,
  end: number
): Rect | null {
  const s = itemRects[start]
  const e = itemRects[end]
  if (!s || !e) return null
  return {
    top: s.top,
    left: Math.min(s.left, e.left),
    width: Math.max(s.width, e.width),
    height: e.top + e.height - s.top
  }
}

function splitAt(
  up: SelectionBlock,
  lo: SelectionBlock,
  midY: number,
  r: number
) {
  const bottom = lo.top + lo.height
  up.height = midY - up.top
  up.radii = [r, r, 0, 0]
  up.instant = true
  lo.top = midY
  lo.height = bottom - midY
  lo.radii = [0, 0, r, r]
  lo.instant = true
  lo.enterFrom = { top: midY, height: bottom - midY, radii: [0, 0, r, r] }
}

function applyMerge(
  blocks: Array<SelectionBlock>,
  sv: SelectionBlock,
  b: Boundary,
  gap: ItemRect,
  r: number
) {
  const midY = gap.top + gap.height / 2
  if (b.phase === "commit") {
    sv.instant = true
    blocks.push({
      key: `sel-${b.otherId}`,
      top: midY,
      left: sv.left,
      width: sv.width,
      height: sv.top + sv.height - midY,
      radii: [0, 0, r, r],
      instant: true,
      exitInstant: true,
      delayCorners: false,
      opacity: 0
    })
    return
  }
  const mergeCornerDelay = Math.min(
    cornerDelay + 0.03,
    Math.max(
      cornerDelay,
      cornerDelay + (midY / Math.max(gap.height, 1)) * 0.002
    )
  )
  const bottom = sv.top + sv.height
  sv.height = midY - sv.top
  sv.radii = [r, r, 0, 0]
  sv.delayCorners = true
  sv.cornerDelay = mergeCornerDelay
  blocks.push({
    key: `sel-${b.otherId}`,
    top: midY,
    left: sv.left,
    width: sv.width,
    height: bottom - midY,
    radii: [0, 0, r, r],
    enterFrom: { top: midY, height: bottom - midY, radii: [r, r, r, r] },
    instant: false,
    exitInstant: true,
    delayCorners: true,
    cornerDelay: mergeCornerDelay
  })
}

export function useMergeSplitBlocks(
  runs: ReadonlyArray<Run>,
  itemRects: ReadonlyArray<ItemRect | undefined>,
  radius: number
): ReadonlyArray<SelectionBlock> {
  const boundaries = useBoundaries(runs)
  const prevRunsRef = useRef<ReadonlyArray<Run>>(runs)
  const prevRuns = prevRunsRef.current
  useLayoutEffect(() => {
    prevRunsRef.current = runs
  })

  const blocks: Array<SelectionBlock> = []
  for (const run of runs) {
    const rect = rectOf(itemRects, run.start, run.end)
    if (rect)
      blocks.push({
        key: `sel-${run.id}`,
        ...rect,
        radii: [radius, radius, radius, radius],
        instant: false,
        exitInstant: false,
        delayCorners: false
      })
  }
  const byId = new Map(blocks.map((b) => [b.key, b]))

  for (const b of boundaries) {
    const gap = itemRects[b.gapIndex]
    const sv = byId.get(`sel-${b.survivorId}`)
    if (!gap || !sv) continue
    if (b.kind === "merge") {
      applyMerge(blocks, sv, b, gap, radius)
      continue
    }
    if (b.phase !== "splitIn") continue
    const lo = byId.get(`sel-${b.otherId}`)
    if (lo) splitAt(sv, lo, gap.top + gap.height / 2, radius)
  }

  for (const p of prevRuns) {
    const c = bridgePair(p, runs)
    const gap = c && itemRects[c.gap]
    if (!c || !gap) continue
    const up = byId.get(`sel-${c.up.id}`)
    const lo = byId.get(`sel-${c.lo.id}`)
    if (up && lo) splitAt(up, lo, gap.top + gap.height / 2, radius)
  }

  return blocks
}

export function SelectionBackgrounds({
  blocks
}: Readonly<{ blocks: ReadonlyArray<SelectionBlock> }>) {
  return (
    <AnimatePresence>
      {blocks.map((b) => {
        const corner = b.delayCorners
          ? { ...mergeSpring, delay: b.cornerDelay ?? cornerDelay }
          : mergeSpring
        const opacity = b.opacity ?? 1
        return (
          <motion.div
            key={b.key}
            aria-hidden
            className="pointer-events-none absolute bg-active"
            initial={
              b.enterFrom
                ? {
                    opacity,
                    top: b.enterFrom.top,
                    left: b.left,
                    width: b.width,
                    height: b.enterFrom.height,
                    borderTopLeftRadius: b.enterFrom.radii[0],
                    borderTopRightRadius: b.enterFrom.radii[1],
                    borderBottomRightRadius: b.enterFrom.radii[2],
                    borderBottomLeftRadius: b.enterFrom.radii[3]
                  }
                : false
            }
            animate={{
              top: b.top,
              left: b.left,
              width: b.width,
              height: b.height,
              borderTopLeftRadius: b.radii[0],
              borderTopRightRadius: b.radii[1],
              borderBottomRightRadius: b.radii[2],
              borderBottomLeftRadius: b.radii[3],
              opacity
            }}
            exit={{
              opacity: 0,
              transition: b.exitInstant ? { duration: 0 } : mergeSpring.exit
            }}
            transition={
              b.instant
                ? { duration: 0 }
                : {
                    ...mergeSpring,
                    borderTopLeftRadius: corner,
                    borderTopRightRadius: corner,
                    borderBottomRightRadius: corner,
                    borderBottomLeftRadius: corner,
                    opacity: { duration: 0.08 }
                  }
            }
          />
        )
      })}
    </AnimatePresence>
  )
}
