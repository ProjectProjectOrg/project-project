import {
  BASELINE_STATUS_SEED,
  BASELINE_STATUS_SLUGS,
  compareStatuses,
  STATUS_PHASES,
  type BaselineStatusSlug,
  type ProjectStatus,
  type StatusSlug
} from "@pp/shared"

import { compareCodePoints } from "@/lib/orderKey"

export type ProjectStatuses = Readonly<{
  projectSlug: string
  statuses: ReadonlyArray<ProjectStatus>
}>

export type StatusColumnMember = Readonly<{
  projectSlug: string
  status: ProjectStatus
}>

export type StatusColumn = Readonly<{
  key: string
  label: string
  color: ProjectStatus["color"]
  icon: ProjectStatus["icon"]
  phase: ProjectStatus["phase"]
  position: number
  members: ReadonlyArray<StatusColumnMember>
}>

export type StatusColumns = Readonly<{
  columns: ReadonlyArray<StatusColumn>
  columnKeyFor: (projectSlug: string, status: StatusSlug) => string | undefined
}>

const BASELINE_PHASE: ReadonlyMap<string, ProjectStatus["phase"]> = new Map(
  BASELINE_STATUS_SEED.map((status) => [status.slug, status.phase])
)

const isBaseline = (slug: string): slug is BaselineStatusSlug =>
  (BASELINE_STATUS_SLUGS as ReadonlyArray<string>).includes(slug)

export const normalizeStatusLabel = (label: string) =>
  label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")

const memberId = (projectSlug: string, status: StatusSlug) =>
  `${projectSlug}\u0000${status}`

const baselineAliases = (projects: ReadonlyArray<ProjectStatuses>) => {
  const aliases = new Map<string, BaselineStatusSlug>()
  for (const slug of BASELINE_STATUS_SLUGS) {
    aliases.set(normalizeStatusLabel(slug), slug)
  }
  for (const slug of BASELINE_STATUS_SLUGS) {
    for (const { statuses } of projects) {
      const baseline = statuses.find((status) => status.slug === slug)
      if (!baseline) continue
      const alias = normalizeStatusLabel(baseline.label)
      if (alias.length > 0 && !aliases.has(alias)) aliases.set(alias, slug)
    }
  }
  return aliases
}

const columnKeyOf = (
  status: ProjectStatus,
  aliases: ReadonlyMap<string, BaselineStatusSlug>
) => {
  if (isBaseline(status.slug)) return status.slug
  const label = normalizeStatusLabel(status.label)
  const baseline = [label, normalizeStatusLabel(status.slug)]
    .map((alias) => aliases.get(alias))
    .find(
      (slug) => slug !== undefined && BASELINE_PHASE.get(slug) === status.phase
    )
  if (baseline !== undefined) return baseline
  return label.length > 0
    ? `label:${status.phase}:${label}`
    : `slug:${status.phase}:${status.slug}`
}

const positionsIn = (statuses: ReadonlyArray<ProjectStatus>) => {
  const ordered = [...statuses].toSorted(compareStatuses)
  return ordered.map((status) => {
    const phase = ordered.filter((other) => other.phase === status.phase)
    return [status, phase.indexOf(status) / phase.length] as const
  })
}

const mostCommonLabel = (members: ReadonlyArray<StatusColumnMember>) => {
  const counts = new Map<string, number>()
  for (const { status } of members) {
    counts.set(status.label, (counts.get(status.label) ?? 0) + 1)
  }
  return members.reduce((best, member) =>
    counts.get(member.status.label)! > counts.get(best.status.label)!
      ? member
      : best
  )
}

export const mergeStatusColumns = (
  projects: ReadonlyArray<ProjectStatuses>
) => {
  const aliases = baselineAliases(projects)
  const groups = new Map<
    string,
    Array<Readonly<{ member: StatusColumnMember; position: number }>>
  >()
  const keyById = new Map<string, string>()
  for (const { projectSlug, statuses } of projects) {
    for (const [status, position] of positionsIn(statuses)) {
      const key = columnKeyOf(status, aliases)
      keyById.set(memberId(projectSlug, status.slug), key)
      const group = groups.get(key) ?? []
      group.push({ member: { projectSlug, status }, position })
      groups.set(key, group)
    }
  }
  const columns = [...groups].map(([key, group]) => {
    const members = group.map(({ member }) => member)
    const representative = mostCommonLabel(members)
    return {
      key,
      label: representative.status.label,
      color: representative.status.color,
      icon: representative.status.icon,
      phase: representative.status.phase,
      position:
        group.reduce((sum, { position }) => sum + position, 0) / group.length,
      members
    }
  })
  return {
    columns: columns.toSorted(
      (a, b) =>
        STATUS_PHASES.indexOf(a.phase) - STATUS_PHASES.indexOf(b.phase) ||
        a.position - b.position ||
        compareCodePoints(
          normalizeStatusLabel(a.label),
          normalizeStatusLabel(b.label)
        ) ||
        compareCodePoints(a.key, b.key)
    ),
    columnKeyFor: (projectSlug, status) =>
      keyById.get(memberId(projectSlug, status))
  } satisfies StatusColumns
}

export type PlacedColumn<T> = StatusColumn &
  Readonly<{ items: ReadonlyArray<T> }>

export const placeInColumns = <T>(
  merged: StatusColumns,
  items: ReadonlyArray<T>,
  locate: (item: T) => readonly [projectSlug: string, status: StatusSlug]
) => {
  const byKey = new Map<string, Array<T>>()
  for (const item of items) {
    const key = merged.columnKeyFor(...locate(item))
    if (key === undefined) continue
    const column = byKey.get(key) ?? []
    column.push(item)
    byKey.set(key, column)
  }
  return merged.columns.flatMap((column) => {
    const placed = byKey.get(column.key) ?? []
    if (placed.length === 0 && !isBaseline(column.key)) return []
    return [{ ...column, items: placed }]
  })
}
