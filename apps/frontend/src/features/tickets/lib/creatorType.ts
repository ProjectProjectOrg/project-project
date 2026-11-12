import {
  isEpicType,
  parseTicketBlocks,
  typeFor,
  type BlockLookup,
  type Library,
  type TypeDefinition,
  type TypeKey
} from "@pp/shared"

import { blockChrome } from "@/features/editor/lib/blockChrome"

import type { TypePrediction } from "./ticketRows"
import { offersType, visibleTypes, type TicketType } from "./ticketTypes"

export const startingType = (
  library: Library | null,
  remembered: TypeKey | null,
  epics: boolean
): TypeKey | null => {
  if (remembered === null || (!epics && isEpicType(remembered))) return null
  if (library === null) return remembered
  return offersType(library.types, remembered, epics) ? remembered : null
}

export type TypeStart =
  | Readonly<{ kind: "sections"; names: ReadonlyArray<string> }>
  | Readonly<{ kind: "text" }>
  | Readonly<{ kind: "empty" }>

export const typeStart = (
  definition: TypeDefinition | null,
  lookup: BlockLookup
): TypeStart => {
  if (definition === null) return { kind: "empty" }
  const segments = parseTicketBlocks(definition.body)
  const names = segments.flatMap((segment) =>
    segment.kind === "block" &&
    (segment.content.trim() !== "" || lookup(segment.type) !== undefined)
      ? [blockChrome(segment.type, lookup).name]
      : []
  )
  if (names.length > 0) return { kind: "sections", names: [...new Set(names)] }
  return segments.some(
    (segment) => segment.kind === "markdown" && segment.text.trim() !== ""
  )
    ? { kind: "text" }
    : { kind: "empty" }
}

export const typePrediction = (
  library: Library | null,
  type: TypeKey | null
): TypePrediction | undefined => {
  const definition =
    library === null || type === null ? null : typeFor(library, type)
  return definition === null
    ? undefined
    : { priority: definition.priority, tags: definition.tags }
}

export const startingTypes = (
  types: ReadonlyArray<TypeDefinition>,
  current: TypeKey | null
): ReadonlyArray<TicketType> => {
  const offered = visibleTypes(types, current !== null && isEpicType(current))
  return [
    ...offered.filter((type) => type.key === current),
    ...offered.filter((type) => type.key !== current)
  ]
}
