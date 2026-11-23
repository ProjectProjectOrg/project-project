import {
  compareStatuses,
  isReservedStatusSlug,
  OrderKey,
  STATUS_PHASES,
  type ProjectStatus,
  type ReorderStatusInput,
  type StatusPhase,
  type StatusSlug
} from "@pp/shared"
import * as Data from "effect/Data"
import { generateKeyBetween } from "fractional-indexing"

export type PhaseEntry = Data.TaggedEnum<{
  phase: Readonly<{ phase: StatusPhase }>
  status: Readonly<{ status: ProjectStatus }>
}>
export const PhaseEntry = Data.taggedEnum<PhaseEntry>()

export const phaseEntries = (statuses: ReadonlyArray<ProjectStatus>) => {
  const sorted = [...statuses].toSorted(compareStatuses)
  return STATUS_PHASES.flatMap<PhaseEntry>((phase) => [
    PhaseEntry.phase({ phase }),
    ...sorted.flatMap((status) =>
      status.phase === phase ? [PhaseEntry.status({ status })] : []
    )
  ])
}

const statusIndex = (entries: ReadonlyArray<PhaseEntry>, slug: string) =>
  entries.findIndex(
    (entry) => PhaseEntry.$is("status")(entry) && entry.status.slug === slug
  )

const neighbourKey = (
  entries: ReadonlyArray<PhaseEntry>,
  from: number,
  step: -1 | 1
) => {
  const entry = entries[from + step]
  return entry === undefined || PhaseEntry.$is("phase")(entry)
    ? null
    : entry.status.orderKey
}

export const placeStatus = (
  entries: ReadonlyArray<PhaseEntry>,
  slug: string
) => {
  const at = statusIndex(entries, slug)
  const entry = entries[at]
  if (entry === undefined || !PhaseEntry.$is("status")(entry)) return null
  const moved = entry.status
  const phase = entries.slice(0, at).findLast(PhaseEntry.$is("phase"))?.phase
  if (phase === undefined) return null
  if (phase !== moved.phase && isReservedStatusSlug(slug)) return null

  const before = neighbourKey(entries, at, -1)
  const after = neighbourKey(entries, at, 1)
  if (before !== null && after !== null && before >= after) return null
  const inPlace =
    phase === moved.phase &&
    (before === null || moved.orderKey > before) &&
    (after === null || moved.orderKey < after)
  if (inPlace) return null
  return {
    phase,
    orderKey: OrderKey.make(generateKeyBetween(before, after))
  } satisfies ReorderStatusInput
}

export const moveStatus = (
  entries: ReadonlyArray<PhaseEntry>,
  slug: string,
  delta: -1 | 1
) => {
  let current = entries
  let at = statusIndex(current, slug)
  while (at + delta >= 1 && at + delta < current.length) {
    const next = [...current]
    const [moved] = next.splice(at, 1)
    next.splice(at + delta, 0, moved)
    const placed = placeStatus(next, slug)
    if (placed !== null) return placed
    current = next
    at += delta
  }
  return null
}

export const keepsPhases = (
  order: ReadonlyArray<StatusSlug>,
  statuses: ReadonlyArray<ProjectStatus>
) => {
  const phases = new Map(statuses.map((s) => [s.slug, s.phase]))
  const ranks = order.flatMap((slug) => {
    const phase = phases.get(slug)
    return phase === undefined ? [] : [STATUS_PHASES.indexOf(phase)]
  })
  return ranks.every((rank, i) => i === 0 || ranks[i - 1] <= rank)
}

export type StatusReorderUpdate = Readonly<{ statusSlug: StatusSlug }> &
  ReorderStatusInput

export const boardReorders = (
  order: ReadonlyArray<StatusSlug>,
  statuses: ReadonlyArray<ProjectStatus>
) => {
  const bySlug = new Map(statuses.map((s) => [s.slug, s]))
  const fits = (key: string, last: string | null) => last === null || key > last
  const updates: Array<StatusReorderUpdate> = []
  for (const phase of STATUS_PHASES) {
    const segment = order.flatMap((slug) => {
      const status = bySlug.get(slug)
      return status?.phase === phase ? [status] : []
    })
    let last: string | null = null
    for (const [i, status] of segment.entries()) {
      if (fits(status.orderKey, last)) {
        last = status.orderKey
        continue
      }
      const next =
        segment
          .slice(i + 1)
          .map((later) => later.orderKey)
          .find((later) => fits(later, last)) ?? null
      const orderKey = OrderKey.make(generateKeyBetween(last, next))
      updates.push({ statusSlug: status.slug, phase, orderKey })
      last = orderKey
    }
  }
  return updates
}
