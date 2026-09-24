import {
  BASELINE_STATUS_SLUGS,
  type BaselineStatusSlug,
  type ProjectStatus,
  type StatusSlug
} from "@pp/shared"

import { compareByOrderKey, compareCodePoints } from "./orderKey"

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
  position: number
  members: ReadonlyArray<StatusColumnMember>
}>

export type StatusColumns = Readonly<{
  columns: ReadonlyArray<StatusColumn>
  columnKeyFor: (projectSlug: string, status: StatusSlug) => string | undefined
}>

const BASELINE_ANCHORS: ReadonlyMap<string, number> = new Map<
  BaselineStatusSlug,
  number
>([
  ["todo", 0],
  ["in_progress", 1],
  ["done", 2]
])

const isBaseline = (slug: string): slug is BaselineStatusSlug =>
  (BASELINE_STATUS_SLUGS as ReadonlyArray<string>).includes(slug)

export const normalizeStatusLabel = (label: string): string =>
  label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")

const memberId = (projectSlug: string, status: StatusSlug): string =>
  `${projectSlug}\u0000${status}`

const baselineAliases = (
  projects: ReadonlyArray<ProjectStatuses>
): ReadonlyMap<string, BaselineStatusSlug> => {
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
): string => {
  if (isBaseline(status.slug)) return status.slug
  const label = normalizeStatusLabel(status.label)
  const baseline =
    aliases.get(label) ?? aliases.get(normalizeStatusLabel(status.slug))
  if (baseline !== undefined) return baseline
  return label.length > 0 ? `label:${label}` : `slug:${status.slug}`
}

const positionsIn = (
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<readonly [ProjectStatus, number]> => {
  const ordered = [...statuses].toSorted(compareByOrderKey)
  const anchors = ordered.flatMap((status, index) => {
    const value = BASELINE_ANCHORS.get(status.slug)
    return value === undefined ? [] : [{ index, value }]
  })
  return ordered.map((status, index) => {
    const anchor = BASELINE_ANCHORS.get(status.slug)
    if (anchor !== undefined) return [status, anchor] as const
    const before = anchors.findLast((anchor) => anchor.index < index)
    const after = anchors.find((anchor) => anchor.index > index)
    if (before && after) {
      const share = (index - before.index) / (after.index - before.index)
      return [status, before.value + (after.value - before.value) * share]
    }
    if (before) return [status, before.value + (index - before.index)]
    if (after) return [status, after.value - (after.index - index)]
    return [status, index]
  })
}

const mostCommonLabel = (
  members: ReadonlyArray<StatusColumnMember>
): StatusColumnMember => {
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
): StatusColumns => {
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
  const columns = [...groups].map(([key, group]): StatusColumn => {
    const members = group.map(({ member }) => member)
    const representative = mostCommonLabel(members)
    return {
      key,
      label: representative.status.label,
      color: representative.status.color,
      icon: representative.status.icon,
      position:
        group.reduce((sum, { position }) => sum + position, 0) / group.length,
      members
    }
  })
  return {
    columns: columns.toSorted(
      (a, b) =>
        a.position - b.position ||
        compareCodePoints(
          normalizeStatusLabel(a.label),
          normalizeStatusLabel(b.label)
        ) ||
        compareCodePoints(a.key, b.key)
    ),
    columnKeyFor: (projectSlug, status) =>
      keyById.get(memberId(projectSlug, status))
  }
}

export type PlacedColumn<T> = StatusColumn &
  Readonly<{ items: ReadonlyArray<T> }>

export const placeInColumns = <T>(
  merged: StatusColumns,
  items: ReadonlyArray<T>,
  locate: (item: T) => readonly [projectSlug: string, status: StatusSlug]
): ReadonlyArray<PlacedColumn<T>> => {
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
