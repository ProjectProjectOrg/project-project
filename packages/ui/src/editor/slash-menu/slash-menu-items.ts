import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  parseTicketBlocks,
  typeFor,
  type BlockDefinition,
  type BlockLookup,
  type Library,
  type TypeKey,
  TicketBlockSegment
} from "@pp/shared"
import * as Data from "effect/Data"

import {
  BASIC_BLOCK_KINDS,
  type BasicBlockKind
} from "../../editor/basic-blocks"
import type { EditorBlocksMode } from "../blocks/editor-blocks"

export type SlashMode = EditorBlocksMode | "basic"

const BASIC_ALIASES: Record<BasicBlockKind, ReadonlyArray<string>> = {
  paragraph: ["text", "plain", "normal", "body"],
  "heading-1": ["h1"],
  "heading-3": ["h3"],
  "heading-4": ["h4"],
  "heading-5": ["h5"],
  "heading-6": ["h6"],
  heading: ["h2", "title"],
  checklist: ["todo", "task"],
  "bullet-list": ["ul", "unordered"],
  "numbered-list": ["ol", "ordered"],
  code: ["fence", "snippet"],
  quote: ["blockquote"],
  divider: ["hr", "rule", "separator"],
  table: ["grid"],
  hint: ["placeholder", "prompt"]
}

export type SlashItem = Data.TaggedEnum<{
  block: Readonly<{
    key: string
    definition: BlockDefinition
    suggestedBy: string | null
  }>
  basic: Readonly<{ key: string; basic: BasicBlockKind }>
  gallery: Readonly<{ key: string }>
}>
export const SlashItem = Data.taggedEnum<SlashItem>()

export type SlashSectionKey = "suggested" | "blocks" | "basic"

export type SlashTab = "all" | "blocks" | "markdown"

export const SLASH_TABS: ReadonlyArray<SlashTab> = ["all", "blocks", "markdown"]

export type SlashSection = Readonly<{
  section: SlashSectionKey
  items: ReadonlyArray<SlashItem>
}>

export type SlashMenuInput = Readonly<{
  library: Library
  lookup: BlockLookup
  ticketType: TypeKey | null
  body: string
  query: string
  basicLabel: (kind: BasicBlockKind) => string
  mode?: SlashMode
}>

const SLASH_QUERY = /^[^\s/]{0,64}$/

export const slashTriggerMatch = (text: string) => {
  const slash = text.lastIndexOf("/")
  if (slash === -1) return null
  if (slash > 0 && !/\s/.test(text[slash - 1])) return null
  const query = text.slice(slash + 1)
  if (!SLASH_QUERY.test(query)) return null
  return {
    leadOffset: slash,
    matchingString: query,
    replaceableString: text.slice(slash)
  } satisfies MenuTextMatch
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "")

export const matchesSlashQuery = (
  query: string,
  texts: ReadonlyArray<string>
) => {
  const needle = query.toLowerCase()
  if (needle === "") return true
  return texts.some(
    (text) =>
      text.toLowerCase().startsWith(needle) ||
      words(text).some((word) => word.startsWith(needle))
  )
}

const blockTypesIn = (markdown: string) =>
  parseTicketBlocks(markdown).flatMap((segment) =>
    TicketBlockSegment.$is("block")(segment) ? [segment.type] : []
  )

const visibleBlocks = (library: Library) =>
  library.blocks.filter((block) => !block.hidden)

const suggestedDefinitions = (
  input: Pick<SlashMenuInput, "library" | "lookup" | "ticketType" | "body">
) => {
  if (input.ticketType === null) return []
  const type = typeFor(input.library, input.ticketType)
  if (type === null) return []
  const present = new Set(blockTypesIn(input.body))
  const seen = new Set<string>()
  return blockTypesIn(type.body).flatMap((key) => {
    if (present.has(key) || seen.has(key)) return []
    seen.add(key)
    const definition = input.lookup(key)
    return definition === undefined || definition.hidden
      ? []
      : [{ definition, by: type.name }]
  })
}

const suggestedItems = (input: SlashMenuInput) =>
  input.query !== ""
    ? []
    : suggestedDefinitions(input).map(({ definition, by }) =>
        SlashItem.block({
          key: `suggested:${definition.key}`,
          definition,
          suggestedBy: by
        })
      )

const blockItems = (input: SlashMenuInput) => {
  const suggested = new Set(
    suggestedItems(input).map((item) => item.definition.key)
  )
  return visibleBlocks(input.library).flatMap<SlashItem>((definition) =>
    !suggested.has(definition.key) &&
    matchesSlashQuery(input.query, [
      definition.name,
      definition.key,
      definition.description
    ])
      ? [
          SlashItem.block({
            key: `block:${definition.key}`,
            definition,
            suggestedBy: null
          })
        ]
      : []
  )
}

export type AddSectionGroups = Readonly<{
  suggestedFor: string | null
  suggested: ReadonlyArray<BlockDefinition>
  all: ReadonlyArray<BlockDefinition>
}>

export const addSectionGroups = (
  input: Pick<SlashMenuInput, "library" | "lookup" | "ticketType" | "body">
) => {
  const suggested = suggestedDefinitions(input)
  const keys = new Set(suggested.map(({ definition }) => definition.key))
  return {
    suggestedFor: suggested[0]?.by ?? null,
    suggested: suggested.map(({ definition }) => definition),
    all: visibleBlocks(input.library).filter(
      (definition) => !keys.has(definition.key)
    )
  }
}

const basicKindsFor = (mode: SlashMode) =>
  mode === "definition"
    ? ([...BASIC_BLOCK_KINDS, "hint"] satisfies ReadonlyArray<BasicBlockKind>)
    : BASIC_BLOCK_KINDS

const basicItems = (input: SlashMenuInput) =>
  basicKindsFor(input.mode ?? "ticket").flatMap<SlashItem>((basic) =>
    matchesSlashQuery(input.query, [
      input.basicLabel(basic),
      basic,
      ...BASIC_ALIASES[basic]
    ])
      ? [SlashItem.basic({ key: `basic:${basic}`, basic })]
      : []
  )

const MODE_SECTIONS: Record<SlashMode, ReadonlySet<SlashSectionKey>> = {
  ticket: new Set(["suggested", "blocks", "basic"]),
  template: new Set(["blocks", "basic"]),
  definition: new Set(["basic"]),
  basic: new Set(["basic"])
}

const TAB_SECTIONS: Record<SlashTab, ReadonlyArray<SlashSectionKey>> = {
  all: ["suggested", "basic", "blocks"],
  blocks: ["suggested", "blocks"],
  markdown: ["basic"]
}

const GALLERY_ITEM = SlashItem.gallery({ key: "gallery:block" })

export const slashMenuSections = (input: SlashMenuInput) =>
  (
    [
      { section: "suggested", items: suggestedItems(input) },
      { section: "blocks", items: blockItems(input) },
      { section: "basic", items: basicItems(input) }
    ] satisfies ReadonlyArray<SlashSection>
  ).filter(
    (section) =>
      section.items.length > 0 &&
      MODE_SECTIONS[input.mode ?? "ticket"].has(section.section)
  )

export type SlashTabCount = Readonly<{ tab: SlashTab; count: number }>

export type SlashMenuView = Readonly<{
  tab: SlashTab
  tabs: ReadonlyArray<SlashTabCount>
  sections: ReadonlyArray<SlashSection>
}>

const libraryIsEmpty = (library: Library, section: SlashSectionKey) =>
  section === "blocks" && visibleBlocks(library).length === 0

/** An item whose own name (or a Markdown alias) starts with the query. */
const namedByQuery = (input: SlashMenuInput, item: SlashItem) => {
  const needle = input.query.toLowerCase()
  const starts = (text: string) => text.toLowerCase().startsWith(needle)
  return SlashItem.$match(item, {
    block: ({ definition }) => starts(definition.name),
    basic: ({ basic }) =>
      [input.basicLabel(basic), basic, ...BASIC_ALIASES[basic]].some(starts),
    gallery: () => false
  })
}

const rankedByQuery = (
  input: SlashMenuInput,
  sections: ReadonlyArray<SlashSection>
) => {
  if (input.query === "") return sections
  const named = (item: SlashItem) => (namedByQuery(input, item) ? 0 : 1)
  return sections
    .map((section) => ({
      ...section,
      items: section.items.toSorted((a, b) => named(a) - named(b))
    }))
    .toSorted(
      (a, b) =>
        Math.min(...a.items.map(named)) - Math.min(...b.items.map(named))
    )
}

const unrankedTabSections = (
  input: SlashMenuInput,
  found: ReadonlyArray<SlashSection>,
  tab: SlashTab
) => {
  const allowed = MODE_SECTIONS[input.mode ?? "ticket"]
  return TAB_SECTIONS[tab].flatMap((key) => {
    if (!allowed.has(key)) return []
    const section = found.find((candidate) => candidate.section === key)
    if (section !== undefined) return [section]
    const teaches =
      libraryIsEmpty(input.library, key) &&
      (input.query === "" || tab !== "all")
    return teaches ? [{ section: key, items: [GALLERY_ITEM] }] : []
  })
}

const tabSections = (
  input: SlashMenuInput,
  found: ReadonlyArray<SlashSection>,
  tab: SlashTab
) => rankedByQuery(input, unrankedTabSections(input, found, tab))

const countOf = (sections: ReadonlyArray<SlashSection>) =>
  sections.reduce(
    (total, section) =>
      total +
      section.items.filter((item) => !SlashItem.$is("gallery")(item)).length,
    0
  )

export const slashTabsFor = (mode: SlashMode) =>
  SLASH_TABS.filter(
    (tab) =>
      tab === "all" ||
      TAB_SECTIONS[tab].some((key) => MODE_SECTIONS[mode].has(key))
  ).filter((tab, _, tabs) => tab !== "all" || tabs.length > 2)

export const cycleSlashTab = (
  tabs: ReadonlyArray<SlashTab>,
  current: SlashTab,
  step: 1 | -1
) => {
  const index = Math.max(0, tabs.indexOf(current))
  return tabs[(index + step + tabs.length) % tabs.length] ?? current
}

export const slashMenuView = (input: SlashMenuInput, requested: SlashTab) => {
  const found = slashMenuSections(input)
  const available = slashTabsFor(input.mode ?? "ticket")
  const tab = available.includes(requested) ? requested : available[0]
  return {
    tab,
    tabs: available.map((candidate) => ({
      tab: candidate,
      count: countOf(tabSections(input, found, candidate))
    })),
    sections: tabSections(input, found, tab)
  }
}
