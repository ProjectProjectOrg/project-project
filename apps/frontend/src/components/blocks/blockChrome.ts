import {
  BUILTIN_BLOCKS,
  FALLBACK_BLOCK_ICON,
  GALLERY_LAYER,
  blockLookupFor,
  resolveLibrary,
  type BlockIconName,
  type BlockLookup,
  type Library,
  type LibraryOrigin
} from "@pp/shared"
import { createContext, useContext, useMemo } from "react"

import { m } from "@/paraglide/messages"

export type BlockChrome = Readonly<{
  name: string
  origin: LibraryOrigin | null
  icon: BlockIconName
  color: string | null
}>

export const BUILTIN_LIBRARY: Library = resolveLibrary(
  { org: GALLERY_LAYER, project: null },
  false
)

const BUILTIN_LOOKUP = blockLookupFor(BUILTIN_LIBRARY)

export const LibraryContext = createContext<Library | null>(null)

export const lookupFor = (library: Library | null): BlockLookup =>
  library === null || library === BUILTIN_LIBRARY
    ? BUILTIN_LOOKUP
    : blockLookupFor(library)

export function useBlockLookup(): BlockLookup {
  const library = useContext(LibraryContext)
  return useMemo(() => lookupFor(library), [library])
}

export const humanizeBlockType = (blockType: string): string => {
  const words = blockType.split("-").join(" ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const galleryChrome = (blockType: string): BlockChrome => {
  const gallery = BUILTIN_BLOCKS.find((block) => block.key === blockType)
  return {
    name: gallery?.name ?? humanizeBlockType(blockType),
    origin: null,
    icon: gallery?.icon ?? FALLBACK_BLOCK_ICON,
    color: null
  }
}

export const blockChrome = (
  blockType: string,
  lookup: BlockLookup
): BlockChrome => {
  const definition = lookup(blockType)
  return definition === undefined
    ? galleryChrome(blockType)
    : {
        name: definition.name,
        origin: definition.origin,
        icon: definition.icon,
        color: definition.color
      }
}

const ORIGIN_LABELS: Record<LibraryOrigin, () => string> = {
  org: m.editor_block_origin_org,
  project: m.editor_block_origin_project
}

export const blockTooltip = (chrome: BlockChrome): string =>
  chrome.origin === null
    ? chrome.name
    : m.editor_block_tooltip({
        name: chrome.name,
        origin: ORIGIN_LABELS[chrome.origin]()
      })

const HEADING_LINE = /^ {0,3}#{1,6}(?:\s|$)/
const EMPTY_LINE = /^\s*(?:(?:[-*+]|\d{1,9}[.)])(?:\s+\[[ xX]\])?)?\s*$/

export const blankBlockHeading = (content: string): string | null => {
  const lines = content.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1) return ""
  const heading = HEADING_LINE.test(lines[first]) ? lines[first] : null
  const rest = lines.slice(heading === null ? first : first + 1)
  return rest.every((line) => EMPTY_LINE.test(line)) ? (heading ?? "") : null
}
