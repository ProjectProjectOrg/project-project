import type {
  ChangelogEntry,
  ChangelogHighlight,
  ChangelogSection,
  ChangelogSectionKind
} from "@pp/shared"

export type WhatsNew = Readonly<{
  version: string
  date: string
  url: string
  highlights: ReadonlyArray<ChangelogHighlight>
  sections: ReadonlyArray<ChangelogSection>
}>

const SECTION_ORDER: ReadonlyArray<ChangelogSectionKind> = [
  "features",
  "improvements",
  "fixes"
]

export const PREVIEW_LINES = 3

const unseenEntries = (
  entries: ReadonlyArray<ChangelogEntry>,
  lastSeen: string | null
) => {
  const seenAt =
    lastSeen === null
      ? -1
      : entries.findIndex((entry) => entry.version === lastSeen)
  return seenAt === -1 ? entries.slice(0, 1) : entries.slice(0, seenAt)
}

export const whatsNew = (
  entries: ReadonlyArray<ChangelogEntry>,
  lastSeen: string | null
) => {
  const unseen = unseenEntries(entries, lastSeen)
  const newest = unseen[0]
  if (newest === undefined) return null
  const sections = SECTION_ORDER.flatMap((kind) => {
    const items = unseen.flatMap((entry) =>
      entry.sections
        .filter((section) => section.kind === kind)
        .flatMap((section) => section.items)
    )
    return items.length === 0 ? [] : [{ kind, items }]
  })
  const highlights = unseen.flatMap((entry) => entry.highlights)
  if (sections.length === 0 && highlights.length === 0) return null
  return {
    version: newest.version,
    date: newest.date,
    url: newest.url,
    highlights,
    sections
  } satisfies WhatsNew
}

export const previewLines = (notes: WhatsNew) =>
  (notes.highlights.length > 0
    ? notes.highlights.map((highlight) => highlight.text)
    : notes.sections.flatMap((section) =>
        section.items.map((item) => item.text)
      )
  ).slice(0, PREVIEW_LINES)

export const topVideo = (notes: WhatsNew) =>
  notes.highlights.find((highlight) => highlight.video !== null)?.video ?? null

export const changeCount = (notes: WhatsNew) =>
  notes.sections.reduce((total, section) => total + section.items.length, 0)

// The rail dot shows exactly when the sidebar card would, so the two never
// disagree (a release with nothing to show leaves both off).
export const hasUnseen = (
  entries: ReadonlyArray<ChangelogEntry>,
  lastSeen: string | null
) => whatsNew(entries, lastSeen) !== null
