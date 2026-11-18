import {
  BASELINE_STATUS_SLUGS,
  STATUS_PHASES,
  type BaselineStatusSlug,
  type StatusPhase
} from "./Status"

export const PHASE_ANCHOR: Readonly<Record<StatusPhase, BaselineStatusSlug>> = {
  unstarted: "todo",
  started: "in_progress",
  finished: "done"
}

const BASELINE_PHASE: ReadonlyMap<string, StatusPhase> = new Map(
  STATUS_PHASES.map((phase) => [PHASE_ANCHOR[phase], phase])
)

type OrderedStatus = Readonly<{ slug: string; orderKey: string }>

const keyOf = (statuses: ReadonlyArray<OrderedStatus>, slug: string) =>
  statuses.find((s) => s.slug === slug)?.orderKey

export const statusPhaseOf = (
  statuses: ReadonlyArray<OrderedStatus>,
  slug: string
) => {
  const baseline = BASELINE_PHASE.get(slug)
  if (baseline !== undefined) return baseline
  const key = keyOf(statuses, slug)
  if (key === undefined) return "unstarted"
  const doneKey = keyOf(statuses, "done")
  if (doneKey !== undefined && key > doneKey) return "finished"
  const startedKey = keyOf(statuses, "in_progress")
  if (startedKey !== undefined && key > startedKey) return "started"
  return "unstarted"
}

export type StatusPhaseOf = (slug: string) => StatusPhase

export const statusPhaseLookup = (statuses: ReadonlyArray<OrderedStatus>) => {
  const phases = new Map(
    statuses.map((s) => [s.slug, statusPhaseOf(statuses, s.slug)])
  )
  return ((slug) =>
    phases.get(slug) ?? statusPhaseOf(statuses, slug)) satisfies StatusPhaseOf
}

export const finishedStatusSlugs = (statuses: ReadonlyArray<OrderedStatus>) =>
  new Set([
    "done",
    ...statuses
      .filter((s) => statusPhaseOf(statuses, s.slug) === "finished")
      .map((s) => s.slug)
  ])

export const hasBaselineOrder = (statuses: ReadonlyArray<OrderedStatus>) => {
  const keys = BASELINE_STATUS_SLUGS.flatMap(
    (slug) => keyOf(statuses, slug) ?? []
  )
  return keys.every((key, i) => i === 0 || keys[i - 1]! < key)
}

export const phaseEndNeighbors = (
  statuses: ReadonlyArray<OrderedStatus>,
  phase: StatusPhase
) => {
  const sorted = [...statuses].toSorted((a, b) =>
    a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
  )
  const last = sorted.findLastIndex(
    (s) => statusPhaseOf(statuses, s.slug) === phase
  )
  const before = last < 0 ? null : sorted[last]!.orderKey
  return [before, sorted[last + 1]?.orderKey ?? null] as const
}
