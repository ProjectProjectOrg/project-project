import type {
  BlockDefinition,
  BlockDraft,
  Library,
  LibraryDefaults,
  LibraryOrigin,
  PartialTemplateDefaults,
  TemplateDefaults,
  TemplateDefinition,
  TemplateDraft,
  UpdateTemplateDefaultsInput
} from "../schemas/Library"
import type { TicketType } from "../schemas/Ticket"
import {
  advanceFence,
  normalizeLineEndings,
  parseTicketBlocks,
  serializeTicketBlocks,
  type TicketBlockSegment
} from "../ticketBlocks"
import { BUILTIN_BLOCKS, BUILTIN_TEMPLATES } from "./gallery"
import { stripHints } from "./hints"

export type Layer = Readonly<{
  blocks: ReadonlyArray<BlockDraft>
  templates: ReadonlyArray<TemplateDraft>
  hiddenBlocks: ReadonlyArray<string>
  hiddenTemplates: ReadonlyArray<string>
}>

export type LibraryLayers = Readonly<{
  org: Layer
  project: Layer | null
}>

export type LayerDefaults = Readonly<{
  org: PartialTemplateDefaults
  project: PartialTemplateDefaults | null
}>

export type TemplateMerge = Readonly<{
  body: string
  added: ReadonlyArray<string>
}>

export type TicketAsTemplate = Readonly<{ body: string; customized: number }>

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
  templates: [],
  hiddenBlocks: [],
  hiddenTemplates: []
}

export const GALLERY_LAYER: Layer = {
  blocks: BUILTIN_BLOCKS,
  templates: BUILTIN_TEMPLATES,
  hiddenBlocks: [],
  hiddenTemplates: []
}

export const NO_TEMPLATE_DEFAULTS: TemplateDefaults = {
  feat: null,
  bug: null,
  chore: null,
  other: null
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
  layers: LibraryLayers
): ReadonlyArray<readonly [LibraryOrigin, Layer]> => [
  ...(layers.project === null ? [] : [["project", layers.project] as const]),
  ["org", layers.org]
]

const TICKET_TYPES: ReadonlyArray<TicketType> = [
  "feat",
  "bug",
  "chore",
  "other"
]

const resolveDefaults = (
  requested: PartialTemplateDefaults,
  fallback: TemplateDefaults,
  active: ReadonlySet<string>
): TemplateDefaults => {
  const resolveType = (type: TicketType) => {
    const key = type in requested ? (requested[type] ?? null) : fallback[type]
    return key !== null && active.has(key) ? key : null
  }
  return {
    feat: resolveType("feat"),
    bug: resolveType("bug"),
    chore: resolveType("chore"),
    other: resolveType("other")
  }
}

export const resolveLibraryDefaults = (
  defaults: LayerDefaults,
  templates: ReadonlyArray<TemplateDefinition>
): LibraryDefaults => {
  const active = new Set(
    templates.flatMap((template) => (template.hidden ? [] : [template.key]))
  )
  const inheritedDefaults =
    defaults.project === null
      ? NO_TEMPLATE_DEFAULTS
      : resolveDefaults(defaults.org, NO_TEMPLATE_DEFAULTS, active)
  const ownDefaults = defaults.project ?? defaults.org
  return {
    defaults: resolveDefaults(ownDefaults, inheritedDefaults, active),
    ownDefaults,
    inheritedDefaults
  }
}

export const withDefaultsUpdate = (
  own: PartialTemplateDefaults,
  update: UpdateTemplateDefaultsInput
): PartialTemplateDefaults => {
  const reset = new Set<TicketType>(update.reset ?? [])
  const next: PartialTemplateDefaults = { ...own, ...update.defaults }
  return Object.fromEntries(
    TICKET_TYPES.flatMap((type) =>
      type in next && !reset.has(type) ? [[type, next[type] ?? null]] : []
    )
  )
}

export const resolveLibrary = (
  layers: LibraryLayers,
  defaults: LayerDefaults,
  canEdit: boolean
): Library => {
  const stack = layerStack(layers)
  const blocks = resolveEntries(
    stack.map(([origin, layer]) => ({
      origin,
      definitions: layer.blocks,
      hidden: layer.hiddenBlocks
    }))
  )
  const templates = resolveEntries(
    stack.map(([origin, layer]) => ({
      origin,
      definitions: layer.templates,
      hidden: layer.hiddenTemplates
    }))
  )
  return {
    blocks,
    templates,
    ...resolveLibraryDefaults(defaults, templates),
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

export const expandTemplate = (
  template: Readonly<{ body: string }>,
  lookup: BlockLookup
): string =>
  serializeTicketBlocks(
    parseTicketBlocks(template.body).flatMap((segment) =>
      expandSegment(segment, lookup, false)
    )
  )

export const expandTemplateKeepingHints = (
  template: Readonly<{ body: string }>,
  lookup: BlockLookup
): string =>
  serializeTicketBlocks(
    parseTicketBlocks(template.body).flatMap((segment) =>
      expandSegment(segment, lookup, true)
    )
  )

const isBlockSegment = (segment: TicketBlockSegment): segment is BlockSegment =>
  segment.kind === "block"

const blockTypesIn = (markdown: string): ReadonlyArray<string> =>
  parseTicketBlocks(markdown)
    .filter(isBlockSegment)
    .map((segment) => segment.type)

export const mergeTemplateInto = (
  body: string,
  expanded: string
): TemplateMerge => {
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

const templateSegmentFromTicket = (
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

export const templateBodyFromTicket = (
  body: string,
  lookup: BlockLookup
): TicketAsTemplate => {
  const segments = parseTicketBlocks(body).map((segment) =>
    templateSegmentFromTicket(segment, lookup)
  )
  return {
    body: serializeTicketBlocks(segments),
    customized: segments.filter(isCustomization).length
  }
}

export const isPristineTemplateBody = (
  body: string,
  template: Readonly<{ body: string }>,
  lookup: BlockLookup
): boolean =>
  comparableMarkdown(body) ===
  comparableMarkdown(expandTemplate(template, lookup))

export const templateFor = (
  library: Library,
  type: TicketType
): TemplateDefinition | null => {
  const key = library.defaults[type]
  if (key === null) return null
  return (
    library.templates.find(
      (template) => template.key === key && !template.hidden
    ) ?? null
  )
}

const keysOf = (entries: ReadonlyArray<Keyed>): ReadonlySet<string> =>
  new Set(entries.map((entry) => entry.key))

export const galleryTemplatesFor = (
  library: Library
): ReadonlyArray<TemplateDraft> => {
  const present = keysOf(library.templates)
  return BUILTIN_TEMPLATES.filter((draft) => !present.has(draft.key))
}

export const galleryBlocksFor = (
  library: Library
): ReadonlyArray<BlockDraft> => {
  const present = keysOf(library.blocks)
  return BUILTIN_BLOCKS.filter((draft) => !present.has(draft.key))
}

export const galleryBlocksToAdopt = (
  library: Library,
  template: Readonly<{ body: string }>
): ReadonlyArray<BlockDraft> => {
  const referenced = new Set(
    parseTicketBlocks(template.body).flatMap((segment) =>
      segment.kind === "block" ? [segment.type] : []
    )
  )
  return galleryBlocksFor(library).filter((draft) => referenced.has(draft.key))
}
