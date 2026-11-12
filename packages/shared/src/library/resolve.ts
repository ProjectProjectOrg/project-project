import {
  advanceFence,
  normalizeLineEndings,
  parseTicketBlocks,
  serializeTicketBlocks,
  type TicketBlockSegment
} from "../tickets/blocks"
import { BUILTIN_BLOCKS, BUILTIN_TYPES } from "./builtins"
import { GALLERY_BLOCKS, GALLERY_TYPES } from "./gallery"
import { stripHints } from "./hints"
import type {
  BlockDefinition,
  BlockDraft,
  Library,
  LibraryOrigin,
  TypeDefinition,
  TypeDraft
} from "./Library"

export type Layer = Readonly<{
  blocks: ReadonlyArray<BlockDraft>
  types: ReadonlyArray<TypeDraft>
  hiddenBlocks: ReadonlyArray<string>
  hiddenTypes: ReadonlyArray<string>
}>

export type LibraryLayers = Readonly<{
  org: Layer
  project: Layer | null
}>

export type TypeMerge = Readonly<{
  body: string
  added: ReadonlyArray<string>
}>

export type TicketAsType = Readonly<{ body: string; customized: number }>

export type BlockLookup = (key: string) => BlockDefinition | undefined

type Keyed = Readonly<{ key: string }>

type LayerView<A extends Keyed> = Readonly<{
  origin: LibraryOrigin
  definitions: ReadonlyArray<A>
  hidden: ReadonlyArray<string>
}>

type Resolved<A extends Keyed> = A &
  Readonly<{
    origin: LibraryOrigin
    shadows: LibraryOrigin | null
    hidden: boolean
  }>

type BlockSegment = Extract<TicketBlockSegment, { kind: "block" }>

export const EMPTY_LAYER: Layer = {
  blocks: [],
  types: [],
  hiddenBlocks: [],
  hiddenTypes: []
}

export const BASE_LAYER: Layer = {
  blocks: BUILTIN_BLOCKS,
  types: BUILTIN_TYPES,
  hiddenBlocks: [],
  hiddenTypes: []
}

export const GALLERY_LAYER: Layer = {
  blocks: GALLERY_BLOCKS,
  types: GALLERY_TYPES,
  hiddenBlocks: [],
  hiddenTypes: []
}

const SYNCED_OPENER = /<block[^>]*\ssync/

const TASK_LINE = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])\](.*)$/

const definitionIn = <A extends Keyed>(
  view: LayerView<A>,
  key: string
): A | undefined =>
  view.definitions.find((definition) => definition.key === key)

const decides = (view: LayerView<Keyed>, key: string): boolean =>
  view.hidden.includes(key) || definitionIn(view, key) !== undefined

const visibleDefinitionIn = <A extends Keyed>(
  view: LayerView<A>,
  key: string
): A | undefined =>
  view.hidden.includes(key) ? undefined : definitionIn(view, key)

const resolveKey = <A extends Keyed>(
  key: string,
  stack: ReadonlyArray<LayerView<A>>
): Resolved<A> | null => {
  const index = stack.findIndex((view) => decides(view, key))
  if (index === -1) return null
  const deciding = stack[index]
  const below = stack.slice(index + 1)
  const shadows = below.find((view) => decides(view, key))?.origin ?? null
  const own = visibleDefinitionIn(deciding, key)
  if (own !== undefined)
    return { ...own, origin: deciding.origin, shadows, hidden: false }
  const hiddenContent = below
    .map((view) => visibleDefinitionIn(view, key))
    .find((definition) => definition !== undefined)
  return hiddenContent === undefined
    ? null
    : { ...hiddenContent, origin: deciding.origin, shadows, hidden: true }
}

const byNameThenKey = (
  a: Readonly<{ name: string; key: string }>,
  b: Readonly<{ name: string; key: string }>
) => a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key, "en")

const resolveEntries = <A extends Keyed & Readonly<{ name: string }>>(
  stack: ReadonlyArray<LayerView<A>>
): ReadonlyArray<Resolved<A>> => {
  const keys = new Set(
    stack.flatMap((view) => [
      ...view.definitions.map((definition) => definition.key),
      ...view.hidden
    ])
  )
  return [...keys]
    .flatMap((key) => resolveKey(key, stack) ?? [])
    .toSorted(byNameThenKey)
}

const layerStack = (
  layers: LibraryLayers,
  base: Layer
): ReadonlyArray<readonly [LibraryOrigin, Layer]> => [
  ...(layers.project === null ? [] : [["project", layers.project] as const]),
  ["org", layers.org],
  ["builtin", base]
]

export const resolveLibrary = (
  layers: LibraryLayers,
  canEdit: boolean,
  base: Layer = BASE_LAYER
): Library => {
  const stack = layerStack(layers, base)
  return {
    blocks: resolveEntries(
      stack.map(([origin, layer]) => ({
        origin,
        definitions: layer.blocks,
        hidden: layer.hiddenBlocks
      }))
    ),
    types: resolveEntries(
      stack.map(([origin, layer]) => ({
        origin,
        definitions: layer.types,
        hidden: layer.hiddenTypes
      }))
    ),
    canEdit
  }
}

export const blockLookupFor = (library: Library): BlockLookup => {
  const visible = new Map<string, BlockDefinition>(
    library.blocks.flatMap((block) =>
      block.hidden ? [] : [[block.key, block] as const]
    )
  )
  return (key) => visible.get(key)
}

const visibleDefinition = (
  lookup: BlockLookup,
  key: string
): BlockDefinition | undefined => {
  const definition = lookup(key)
  return definition === undefined || definition.hidden ? undefined : definition
}

const blockSegment = (
  type: string,
  content: string,
  sync: boolean
): BlockSegment =>
  sync
    ? { kind: "block", type, content, sync: true }
    : { kind: "block", type, content }

const isBlank = (text: string): boolean => text.trim() === ""

const expandSegment = (
  segment: TicketBlockSegment,
  lookup: BlockLookup,
  keepHints: boolean
): ReadonlyArray<TicketBlockSegment> => {
  const clean = (text: string) => (keepHints ? text : stripHints(text))
  if (segment.kind === "markdown") {
    const text = clean(segment.text).trim()
    return text === "" ? [] : [{ kind: "markdown", text }]
  }
  if (!isBlank(segment.content))
    return [blockSegment(segment.type, clean(segment.content), false)]
  const definition = visibleDefinition(lookup, segment.type)
  return definition === undefined
    ? []
    : [blockSegment(segment.type, clean(definition.content), definition.sync)]
}

export const expandType = (
  type: Readonly<{ body: string }>,
  lookup: BlockLookup
): string =>
  serializeTicketBlocks(
    parseTicketBlocks(type.body).flatMap((segment) =>
      expandSegment(segment, lookup, false)
    )
  )

export const expandTypeKeepingHints = (
  type: Readonly<{ body: string }>,
  lookup: BlockLookup
): string =>
  serializeTicketBlocks(
    parseTicketBlocks(type.body).flatMap((segment) =>
      expandSegment(segment, lookup, true)
    )
  )

const isBlockSegment = (segment: TicketBlockSegment): segment is BlockSegment =>
  segment.kind === "block"

const blockTypesIn = (markdown: string): ReadonlyArray<string> =>
  parseTicketBlocks(markdown)
    .filter(isBlockSegment)
    .map((segment) => segment.type)

export const mergeTypeInto = (body: string, expanded: string): TypeMerge => {
  if (isBlank(body)) return { body: expanded, added: blockTypesIn(expanded) }
  const present = new Set(blockTypesIn(body))
  const missing = parseTicketBlocks(expanded)
    .filter(isBlockSegment)
    .filter((segment) => !present.has(segment.type))
  if (missing.length === 0) return { body, added: [] }
  return {
    body: `${body.trimEnd()}\n\n${serializeTicketBlocks(missing)}`,
    added: missing.map((segment) => segment.type)
  }
}

const withCodeFlags = (
  markdown: string
): ReadonlyArray<readonly [string, boolean]> => {
  let fence: string | null = null
  return normalizeLineEndings(markdown)
    .split("\n")
    .map((line) => {
      const insideCode = fence !== null || advanceFence(line, null) !== null
      fence = advanceFence(line, fence)
      return [line, insideCode] as const
    })
}

const mapOutsideFences = (
  markdown: string,
  transform: (line: string) => string
): string =>
  withCodeFlags(markdown)
    .map(([line, insideCode]) => (insideCode ? line : transform(line)))
    .join("\n")

const taskItemKey = (text: string): string =>
  text.replace(/\s+/g, " ").trim().toLowerCase()

const ticksBySnapshotItem = (snapshot: string): Map<string, Array<boolean>> => {
  const ticks = new Map<string, Array<boolean>>()
  for (const [line, insideCode] of withCodeFlags(snapshot)) {
    const task = insideCode ? null : TASK_LINE.exec(line)
    if (task === null) continue
    const key = taskItemKey(task[3])
    ticks.set(key, [...(ticks.get(key) ?? []), task[2] !== " "])
  }
  return ticks
}

export const mergeChecklistTicks = (
  definitionContent: string,
  snapshot: string
): string => {
  const ticks = ticksBySnapshotItem(snapshot)
  return mapOutsideFences(stripHints(definitionContent), (line) => {
    const task = TASK_LINE.exec(line)
    if (task === null) return line
    const ticked = ticks.get(taskItemKey(task[3]))?.shift() ?? false
    return `${task[1]}${ticked ? "x" : " "}]${task[3]}`
  })
}

const isSyncedSegment = (
  segment: TicketBlockSegment
): segment is BlockSegment => segment.kind === "block" && segment.sync === true

const resolveSyncedSegment = (
  segment: BlockSegment,
  lookup: BlockLookup
): BlockSegment => {
  const definition = visibleDefinition(lookup, segment.type)
  return definition?.sync === true
    ? blockSegment(
        segment.type,
        mergeChecklistTicks(definition.content, segment.content),
        true
      )
    : blockSegment(segment.type, segment.content, false)
}

export const resolveSyncedBlocks = (
  body: string,
  lookup: BlockLookup
): string => {
  if (!SYNCED_OPENER.test(body)) return body
  const segments = parseTicketBlocks(body)
  if (!segments.some(isSyncedSegment)) return body
  return serializeTicketBlocks(
    segments.map((segment) =>
      isSyncedSegment(segment) ? resolveSyncedSegment(segment, lookup) : segment
    )
  )
}

const comparableMarkdown = (markdown: string): string =>
  markdown.replace(/\s+/g, " ").trim()

export const blockMatchesDefinition = (
  content: string,
  definition: BlockDefinition
): boolean =>
  comparableMarkdown(content) ===
  comparableMarkdown(stripHints(definition.content))

const typeSegmentFromTicket = (
  segment: TicketBlockSegment,
  lookup: BlockLookup
): TicketBlockSegment => {
  if (segment.kind === "markdown") return segment
  const definition = visibleDefinition(lookup, segment.type)
  const isReference =
    definition !== undefined &&
    (segment.sync === true ||
      blockMatchesDefinition(segment.content, definition))
  return blockSegment(segment.type, isReference ? "" : segment.content, false)
}

const isCustomization = (segment: TicketBlockSegment): boolean =>
  segment.kind === "block" && !isBlank(segment.content)

export const typeBodyFromTicket = (
  body: string,
  lookup: BlockLookup
): TicketAsType => {
  const segments = parseTicketBlocks(body).map((segment) =>
    typeSegmentFromTicket(segment, lookup)
  )
  return {
    body: serializeTicketBlocks(segments),
    customized: segments.filter(isCustomization).length
  }
}

export const isPristineTypeBody = (
  body: string,
  type: Readonly<{ body: string }>,
  lookup: BlockLookup
): boolean =>
  comparableMarkdown(body) === comparableMarkdown(expandType(type, lookup))

export const typeFor = (library: Library, key: string): TypeDefinition | null =>
  library.types.find((type) => type.key === key && !type.hidden) ?? null

const keysOf = (entries: ReadonlyArray<Keyed>): ReadonlySet<string> =>
  new Set(entries.map((entry) => entry.key))

export const galleryTypesFor = (library: Library): ReadonlyArray<TypeDraft> => {
  const present = keysOf(library.types)
  return GALLERY_TYPES.filter((draft) => !present.has(draft.key))
}

export const galleryBlocksFor = (
  library: Library
): ReadonlyArray<BlockDraft> => {
  const present = keysOf(library.blocks)
  return GALLERY_BLOCKS.filter((draft) => !present.has(draft.key))
}

export const galleryBlocksToAdopt = (
  library: Library,
  type: Readonly<{ body: string }>
): ReadonlyArray<BlockDraft> => {
  const referenced = new Set(
    parseTicketBlocks(type.body).flatMap((segment) =>
      segment.kind === "block" ? [segment.type] : []
    )
  )
  return galleryBlocksFor(library).filter((draft) => referenced.has(draft.key))
}
