import {
  CHANGELOG_AREAS,
  type ChangelogArea,
  type ChangelogEntry,
  type ChangelogItem,
  type ChangelogSectionKind
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"

export const SECTION_KINDS: ReadonlyArray<ChangelogSectionKind> = [
  "features",
  "improvements",
  "fixes"
]

export type AreaRun = Readonly<{
  area: ChangelogArea | null
  items: ReadonlyArray<ChangelogItem>
}>

export type ReleaseCounts = Readonly<{
  highlights: number
  notices: number
  features: number
  improvements: number
  fixes: number
  changes: number
}>

export type IndexItem = Readonly<{
  id: string
  label: string
  count: number | null
  children: ReadonlyArray<Readonly<{ id: string; label: string }>>
}>

export type IndexLabels = Readonly<{
  highlights: string
  notices: string
  sections: Readonly<Record<ChangelogSectionKind, string>>
  earlier: string
}>

export const SECTION_IDS = {
  highlights: "highlights",
  notices: "before-you-update",
  features: "new",
  improvements: "improved",
  fixes: "fixed",
  earlier: "earlier-releases"
} as const

export const highlightId = (rank: number) => `highlight-${rank}`

const RELEASE_HASH = /^#release-(.+)$/

export const releaseFromHash = (hash: string) => {
  const version = RELEASE_HASH.exec(hash)?.[1]
  return version === undefined ? null : decodeURIComponent(version)
}

const GITHUB_REPO = /^https:\/\/github\.com\/[^/]+\/[^/]+/

export const repositoryUrl = (releaseUrl: string) =>
  GITHUB_REPO.exec(releaseUrl)?.[0] ?? null

export const sectionItems = (
  entry: ChangelogEntry,
  kind: ChangelogSectionKind
) =>
  entry.sections
    .filter((section) => section.kind === kind)
    .flatMap((section) => section.items)

const areaOrder = (area: ChangelogArea | null) =>
  area === null ? CHANGELOG_AREAS.length : CHANGELOG_AREAS.indexOf(area)

export const groupByArea = (items: ReadonlyArray<ChangelogItem>) => {
  const runs = new Map<ChangelogArea | null, Array<ChangelogItem>>()
  for (const item of items) {
    const run = runs.get(item.area)
    if (run === undefined) runs.set(item.area, [item])
    else run.push(item)
  }
  return [...runs.entries()]
    .map(([area, runItems]) => ({ area, items: runItems }) satisfies AreaRun)
    .toSorted((a, b) => areaOrder(a.area) - areaOrder(b.area))
}

export const releaseCounts = (entry: ChangelogEntry) => {
  const features = sectionItems(entry, "features").length
  const improvements = sectionItems(entry, "improvements").length
  const fixes = sectionItems(entry, "fixes").length
  return {
    highlights: entry.highlights.length,
    notices: entry.notices.length,
    features,
    improvements,
    fixes,
    changes: features + improvements + fixes
  } satisfies ReleaseCounts
}

export const indexItems = (
  entry: ChangelogEntry,
  labels: IndexLabels,
  hasEarlier: boolean
) => {
  const highlights: ReadonlyArray<IndexItem> =
    entry.highlights.length === 0
      ? []
      : [
          {
            id: SECTION_IDS.highlights,
            label: labels.highlights,
            count: null,
            children: entry.highlights.map((highlight, index) => ({
              id: highlightId(index + 1),
              label: highlight.text
            }))
          }
        ]
  const notices: ReadonlyArray<IndexItem> =
    entry.notices.length === 0
      ? []
      : [
          {
            id: SECTION_IDS.notices,
            label: labels.notices,
            count: null,
            children: []
          }
        ]
  const sections = SECTION_KINDS.flatMap((kind) => {
    const count = sectionItems(entry, kind).length
    return count === 0
      ? []
      : [
          {
            id: SECTION_IDS[kind],
            label: labels.sections[kind],
            count,
            children: []
          }
        ]
  })
  const earlier: ReadonlyArray<IndexItem> = hasEarlier
    ? [
        {
          id: SECTION_IDS.earlier,
          label: labels.earlier,
          count: null,
          children: []
        }
      ]
    : []
  return [...highlights, ...sections, ...notices, ...earlier]
}

export const indexIds = (items: ReadonlyArray<IndexItem>) =>
  items.flatMap((item) => [item.id, ...item.children.map((child) => child.id)])

export const releaseDate = (
  date: string,
  dateStyle: "long" | "medium",
  locale: string
) =>
  Option.match(DateTime.make(date), {
    onNone: () => null,
    onSome: (at) => DateTime.format(at, { locale, dateStyle })
  })
