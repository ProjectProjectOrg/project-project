import type {
  BlockDefinition,
  BlockDraft,
  Library,
  LibraryOrigin,
  UpdateBlockInput
} from "@pp/shared"

type Keyed = Readonly<{ key: string; name: string }>

type Placed = Readonly<{
  origin: LibraryOrigin
  shadows: LibraryOrigin | null
  hidden: boolean
}>

type Entry<Draft extends Keyed> = Draft & Placed

const byNameThenKey = (a: Keyed, b: Keyed) =>
  a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key, "en")

const definedFields = <A extends object>(patch: A): Partial<A> =>
  Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<A>

const upsert = <A extends Keyed>(
  entries: ReadonlyArray<A>,
  entry: A
): ReadonlyArray<A> =>
  [...entries.filter((current) => current.key !== entry.key), entry].toSorted(
    byNameThenKey
  )

const created = <Draft extends Keyed>(
  entries: ReadonlyArray<Entry<Draft>>,
  draft: Draft,
  origin: LibraryOrigin
): ReadonlyArray<Entry<Draft>> => {
  const existing = entries.find((entry) => entry.key === draft.key)
  const shadows =
    existing === undefined
      ? null
      : existing.origin === origin
        ? existing.shadows
        : existing.origin
  return upsert(entries, { ...draft, origin, shadows, hidden: false })
}

const updated = <Draft extends Keyed>(
  entries: ReadonlyArray<Entry<Draft>>,
  key: string,
  patch: Partial<Draft>
): ReadonlyArray<Entry<Draft>> =>
  entries
    .map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    .toSorted(byNameThenKey)

const removed = <Draft extends Keyed>(
  entries: ReadonlyArray<Entry<Draft>>,
  key: string,
  origin: LibraryOrigin
): ReadonlyArray<Entry<Draft>> => {
  const entry = entries.find((current) => current.key === key)
  if (entry === undefined) return entries
  if (entry.origin !== origin)
    return entry.shadows === origin
      ? entries.map((current) =>
          current.key === key ? { ...current, shadows: null } : current
        )
      : entries
  const rest = entries.filter((current) => current.key !== key)
  if (entry.hidden && entry.shadows !== null)
    return upsert(rest, {
      ...entry,
      origin: entry.shadows,
      shadows: null,
      hidden: false
    })
  return rest
}

const hidden = <Draft extends Keyed>(
  entries: ReadonlyArray<Entry<Draft>>,
  key: string
): ReadonlyArray<Entry<Draft>> =>
  entries.map((entry) =>
    entry.key === key && entry.origin === "org"
      ? { ...entry, origin: "project", shadows: "org", hidden: true }
      : entry
  )

const withBlocks = (
  library: Library,
  change: (
    blocks: ReadonlyArray<BlockDefinition>
  ) => ReadonlyArray<BlockDefinition>
): Library => ({ ...library, blocks: change(library.blocks) })

export const applyBlockUpsert = (
  library: Library,
  block: BlockDefinition
): Library => withBlocks(library, (blocks) => upsert(blocks, block))

export const applyBlockCreate = (
  library: Library,
  draft: BlockDraft,
  origin: LibraryOrigin
): Library => withBlocks(library, (blocks) => created(blocks, draft, origin))

export const applyBlockUpdate = (
  library: Library,
  key: string,
  patch: UpdateBlockInput
): Library =>
  withBlocks(library, (blocks) =>
    updated<BlockDraft>(blocks, key, definedFields(patch))
  )

export const applyBlockRemove = (
  library: Library,
  key: string,
  origin: LibraryOrigin
): Library => withBlocks(library, (blocks) => removed(blocks, key, origin))

export const applyBlockHide = (library: Library, key: string): Library =>
  withBlocks(library, (blocks) => hidden(blocks, key))
