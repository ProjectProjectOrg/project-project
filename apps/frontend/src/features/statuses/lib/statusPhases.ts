import {
  BASELINE_STATUS_SLUGS,
  hasBaselineOrder,
  OrderKey,
  PHASE_ANCHOR,
  STATUS_PHASES,
  statusPhaseOf,
  type ProjectStatus,
  type StatusPhase,
  type StatusSlug
} from "@pp/shared"
import { generateKeyBetween } from "fractional-indexing"

import { compareByOrderKey } from "@/lib/orderKey"

export type PhaseEntry =
  | Readonly<{ kind: "phase"; phase: StatusPhase }>
  | Readonly<{ kind: "status"; status: ProjectStatus }>

export const isPinnedStatus = (slug: string): boolean =>
  slug === PHASE_ANCHOR.started || slug === PHASE_ANCHOR.finished

export const phaseEntries = (
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<PhaseEntry> => {
  const sorted = [...statuses].toSorted(compareByOrderKey)
  return STATUS_PHASES.flatMap(
    (phase): ReadonlyArray<PhaseEntry> => [
      { kind: "phase", phase },
      ...sorted.flatMap((status) =>
        statusPhaseOf(statuses, status.slug) === phase
          ? [{ kind: "status" as const, status }]
          : []
      )
    ]
  )
}

const statusIndex = (entries: ReadonlyArray<PhaseEntry>, slug: string) =>
  entries.findIndex(
    (entry) => entry.kind === "status" && entry.status.slug === slug
  )

export const placeStatus = (
  entries: ReadonlyArray<PhaseEntry>,
  slug: string
): OrderKey | null => {
  const at = statusIndex(entries, slug)
  const entry = entries[at]
  if (entry?.kind !== "status" || isPinnedStatus(slug)) return null
  const moved = entry.status

  const groups: Record<StatusPhase, Array<ProjectStatus>> = {
    unstarted: [],
    started: [],
    finished: []
  }
  let phase: StatusPhase = "unstarted"
  let target: StatusPhase = "unstarted"
  let index = 0
  for (const [i, e] of entries.entries()) {
    if (e.kind === "phase") phase = e.phase
    if (i === at) {
      target = phase
      index = groups[phase].length
    } else if (e.kind === "status") groups[phase].push(e.status)
  }

  if (slug === PHASE_ANCHOR.unstarted && target !== "unstarted") {
    target = "unstarted"
    index = groups.unstarted.length
  }
  if (target !== "unstarted") {
    const anchor = groups[target].findIndex(
      (s) => s.slug === PHASE_ANCHOR[target]
    )
    index = Math.max(index, anchor + 1)
  }
  groups[target].splice(index, 0, moved)

  const order = STATUS_PHASES.flatMap((p) => groups[p])
  const i = order.indexOf(moved)
  const before = order[i - 1]?.orderKey ?? null
  const after = order[i + 1]?.orderKey ?? null
  if (before !== null && after !== null && before >= after) return null
  const inPlace =
    (before === null || moved.orderKey > before) &&
    (after === null || moved.orderKey < after)
  return inPlace ? null : OrderKey.make(generateKeyBetween(before, after))
}

export const moveStatus = (
  entries: ReadonlyArray<PhaseEntry>,
  slug: string,
  delta: -1 | 1
): OrderKey | null => {
  let current = entries
  let at = statusIndex(current, slug)
  while (at + delta >= 1 && at + delta < current.length) {
    const next = [...current]
    const [moved] = next.splice(at, 1)
    next.splice(at + delta, 0, moved)
    const key = placeStatus(next, slug)
    if (key !== null) return key
    current = next
    at += delta
  }
  return null
}

export const keepsBaselineOrder = (order: ReadonlyArray<string>): boolean => {
  const positions = BASELINE_STATUS_SLUGS.map((slug) =>
    order.indexOf(slug)
  ).filter((position) => position >= 0)
  return positions.every(
    (position, i) => i === 0 || positions[i - 1] < position
  )
}

export type StatusReorderUpdate = Readonly<{
  statusSlug: StatusSlug
  orderKey: OrderKey
}>

const isBaselineSlug = (slug: string) =>
  BASELINE_STATUS_SLUGS.some((baseline) => baseline === slug)

export const boardReorders = (
  order: ReadonlyArray<StatusSlug>,
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<StatusReorderUpdate> => {
  const keys = new Map(statuses.map((s) => [s.slug, s.orderKey]))
  const anchored = hasBaselineOrder(statuses)
  const updates: Array<StatusReorderUpdate> = []
  let lower: string | null = null
  let segment: Array<StatusSlug> = []

  const flush = (upper: string | null) => {
    const fits = (key: string, last: string | null) =>
      (last === null || key > last) && (upper === null || key < upper)
    let last = lower
    for (const [i, slug] of segment.entries()) {
      const key = keys.get(slug)
      if (key === undefined) continue
      if (fits(key, last)) {
        last = key
        continue
      }
      const next =
        segment
          .slice(i + 1)
          .flatMap((later) => keys.get(later) ?? [])
          .find((later) => fits(later, last)) ?? upper
      const orderKey = OrderKey.make(generateKeyBetween(last, next))
      updates.push({ statusSlug: slug, orderKey })
      last = orderKey
    }
    segment = []
  }

  for (const slug of order) {
    const key = keys.get(slug)
    if (key === undefined) continue
    if (anchored && isBaselineSlug(slug)) {
      flush(key)
      lower = key
    } else segment.push(slug)
  }
  flush(null)
  return updates
}
