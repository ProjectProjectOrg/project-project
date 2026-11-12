import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  parseTicketBlocks,
  typeFor,
  type BlockDefinition,
  type BlockLookup,
  type Library,
  type TypeKey
} from "@pp/shared"

import type { EditorBlocksMode } from "./editorBlocks"

export type SlashMode = EditorBlocksMode | "basic"

export type SlashBasicKind =
  | "paragraph"
  | "heading-1"
  | "heading"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "checklist"
  | "bullet-list"
  | "numbered-list"
  | "code"
  | "quote"
  | "divider"
  | "table"
  | "hint"

export const SLASH_BASIC_KINDS: ReadonlyArray<SlashBasicKind> = [
  "paragraph",
  "heading-1",
  "heading",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "checklist",
  "bullet-list",
  "numbered-list",
  "code",
  "quote",
  "divider",
  "table"
]

const BASIC_ALIASES: Record<SlashBasicKind, ReadonlyArray<string>> = {
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

export type SlashItem =
  | Readonly<{
      kind: "block"
      key: string
      definition: BlockDefinition
      suggestedBy: string | null
    }>
  | Readonly<{ kind: "basic"; key: string; basic: SlashBasicKind }>
  | Readonly<{ kind: "gallery"; key: string }>

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
  basicLabel: (kind: SlashBasicKind) => string
  mode?: SlashMode
}>

const SLASH_QUERY = /^[^\s/]{0,64}$/

export const slashTriggerMatch = (text: string): MenuTextMatch | null => {
  const slash = text.lastIndexOf("/")
  if (slash === -1) return null
  if (slash > 0 && !/\s/.test(text[slash - 1])) return null
  const query = text.slice(slash + 1)
  if (!SLASH_QUERY.test(query)) return null
  return {
    leadOffset: slash,
    matchingString: query,
    replaceableString: text.slice(slash)
  }
}

const words = (text: string): ReadonlyArray<string> =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "")

export const matchesSlashQuery = (
  query: string,
  texts: ReadonlyArray<string>
): boolean => {
  const needle = query.toLowerCase()
  if (needle === "") return true
  return texts.some(
    (text) =>
      text.toLowerCase().startsWith(needle) ||
      words(text).some((word) => word.startsWith(needle))
  )
}

const blockTypesIn = (markdown: string): ReadonlyArray<string> =>
  parseTicketBlocks(markdown).flatMap((segment) =>
    segment.kind === "block" ? [segment.type] : []
  )

const visibleBlocks = (library: Library): ReadonlyArray<BlockDefinition> =>
  library.blocks.filter((block) => !block.hidden)

const suggestedDefinitions = (
  input: Pick<SlashMenuInput, "library" | "lookup" | "ticketType" | "body">
): ReadonlyArray<Readonly<{ definition: BlockDefinition; by: string }>> => {
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

const suggestedItems = (input: SlashMenuInput): ReadonlyArray<SlashItem> =>
  input.query !== ""
    ? []
    : suggestedDefinitions(input).map(({ definition, by }) => ({
        kind: "block",
        key: `suggested:${definition.key}`,
        definition,
        suggestedBy: by
      }))

const blockItems = (input: SlashMenuInput): ReadonlyArray<SlashItem> => {
  const suggested = new Set(
    suggestedItems(input).flatMap((item) =>
      item.kind === "block" ? [item.definition.key] : []
    )
  )
  return visibleBlocks(input.library).flatMap(
    (definition): ReadonlyArray<SlashItem> =>
      !suggested.has(definition.key) &&
      matchesSlashQuery(input.query, [
        definition.name,
        definition.key,
        definition.description
      ])
        ? [
            {
              kind: "block",
              key: `block:${definition.key}`,
              definition,
              suggestedBy: null
            }
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
): AddSectionGroups => {
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

const basicKindsFor = (mode: SlashMode): ReadonlyArray<SlashBasicKind> =>
  mode === "definition" ? [...SLASH_BASIC_KINDS, "hint"] : SLASH_BASIC_KINDS

const basicItems = (input: SlashMenuInput): ReadonlyArray<SlashItem> =>
  basicKindsFor(input.mode ?? "ticket").flatMap(
    (basic): ReadonlyArray<SlashItem> =>
      matchesSlashQuery(input.query, [
        input.basicLabel(basic),
        basic,
        ...BASIC_ALIASES[basic]
      ])
        ? [{ kind: "basic", key: `basic:${basic}`, basic }]
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

const GALLERY_ITEM: SlashItem = { kind: "gallery", key: "gallery:block" }

export const slashMenuSections = (
  input: SlashMenuInput
): ReadonlyArray<SlashSection> =>
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

const libraryIsEmpty = (library: Library, section: SlashSectionKey): boolean =>
  section === "blocks" && visibleBlocks(library).length === 0

/** An item whose own name (or a Markdown alias) starts with the query. */
const namedByQuery = (input: SlashMenuInput, item: SlashItem): boolean => {
  const needle = input.query.toLowerCase()
  const starts = (text: string) => text.toLowerCase().startsWith(needle)
  switch (item.kind) {
    case "block":
      return starts(item.definition.name)
    case "basic":
      return [
        input.basicLabel(item.basic),
        item.basic,
        ...BASIC_ALIASES[item.basic]
      ].some(starts)
    case "gallery":
      return false
  }
}

const rankedByQuery = (
  input: SlashMenuInput,
  sections: ReadonlyArray<SlashSection>
): ReadonlyArray<SlashSection> => {
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
): ReadonlyArray<SlashSection> => {
  const allowed = MODE_SECTIONS[input.mode ?? "ticket"]
  return TAB_SECTIONS[tab].flatMap((key): ReadonlyArray<SlashSection> => {
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
): ReadonlyArray<SlashSection> =>
  rankedByQuery(input, unrankedTabSections(input, found, tab))

const countOf = (sections: ReadonlyArray<SlashSection>): number =>
  sections.reduce(
    (total, section) =>
      total + section.items.filter((item) => item.kind !== "gallery").length,
    0
  )

export const slashTabsFor = (mode: SlashMode): ReadonlyArray<SlashTab> =>
  SLASH_TABS.filter(
    (tab) =>
      tab === "all" ||
      TAB_SECTIONS[tab].some((key) => MODE_SECTIONS[mode].has(key))
  ).filter((tab, _, tabs) => tab !== "all" || tabs.length > 2)

export const cycleSlashTab = (
  tabs: ReadonlyArray<SlashTab>,
  current: SlashTab,
  step: 1 | -1
): SlashTab => {
  const index = Math.max(0, tabs.indexOf(current))
  return tabs[(index + step + tabs.length) % tabs.length] ?? current
}

export const slashMenuView = (
  input: SlashMenuInput,
  requested: SlashTab
): SlashMenuView => {
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
