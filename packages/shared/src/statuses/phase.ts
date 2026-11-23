import { BASELINE_STATUS_SEED, STATUS_PHASES, type StatusPhase } from "./Status"

const BASELINE_PHASE: ReadonlyMap<string, StatusPhase> = new Map(
  BASELINE_STATUS_SEED.map((status) => [status.slug, status.phase])
)

type PhasedStatus = Readonly<{ slug: string; phase: StatusPhase }>
type OrderedStatus = PhasedStatus & Readonly<{ orderKey: string }>

export const statusPhaseOf = (
  statuses: ReadonlyArray<PhasedStatus>,
  slug: string
) =>
  statuses.find((s) => s.slug === slug)?.phase ??
  BASELINE_PHASE.get(slug) ??
  "unstarted"

export type StatusPhaseOf = (slug: string) => StatusPhase

export const statusPhaseLookup = (statuses: ReadonlyArray<PhasedStatus>) => {
  const phases = new Map(statuses.map((s) => [s.slug, s.phase]))
  return ((slug) =>
    phases.get(slug) ?? statusPhaseOf([], slug)) satisfies StatusPhaseOf
}

export const finishedStatusSlugs = (statuses: ReadonlyArray<PhasedStatus>) =>
  new Set([
    "done",
    ...statuses.filter((s) => s.phase === "finished").map((s) => s.slug)
  ])

export const compareStatuses = (a: OrderedStatus, b: OrderedStatus) =>
  STATUS_PHASES.indexOf(a.phase) - STATUS_PHASES.indexOf(b.phase) ||
  (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)

export const lastKeyInPhase = (
  statuses: ReadonlyArray<OrderedStatus>,
  phase: StatusPhase
) =>
  statuses
    .filter((s) => s.phase === phase)
    .map((s) => s.orderKey)
    .toSorted()
    .at(-1) ?? null

type KeyedStatus = Readonly<{ slug: string; orderKey: string }>

export const phasesFromOrder = (statuses: ReadonlyArray<KeyedStatus>) => {
  const keyOf = (slug: string) =>
    statuses.find((s) => s.slug === slug)?.orderKey
  const doneKey = keyOf("done")
  const startedKey = keyOf("in_progress")
  return ((slug) => {
    const baseline = BASELINE_PHASE.get(slug)
    if (baseline !== undefined) return baseline
    const key = keyOf(slug)
    if (key === undefined) return "unstarted"
    if (doneKey !== undefined && key > doneKey) return "finished"
    if (startedKey !== undefined && key > startedKey) return "started"
    return "unstarted"
  }) satisfies StatusPhaseOf
}
