import {
  isEpicType,
  parseTicketBlocks,
  typeFor,
  type BlockLookup,
  type Library,
  type TypeDefinition,
  type TypeKey,
  TicketBlockSegment
} from "@pp/shared"
import { blockChrome } from "@pp/ui/editor/blocks/block-chrome"
import * as Data from "effect/Data"

import type { TypePrediction } from "./ticketRows"
import { offersType, visibleTypes } from "./ticketTypes"

export const startingType = (
  library: Library | null,
  remembered: TypeKey | null,
  epics: boolean
) => {
  if (remembered === null || (!epics && isEpicType(remembered))) return null
  if (library === null) return remembered
  return offersType(library.types, remembered, epics) ? remembered : null
}

export type TypeStart = Data.TaggedEnum<{
  sections: { readonly names: ReadonlyArray<string> }
  text: {}
  empty: {}
}>
export const TypeStart = Data.taggedEnum<TypeStart>()

export const typeStart = (
  definition: TypeDefinition | null,
  lookup: BlockLookup
) => {
  if (definition === null) return TypeStart.empty()
  const segments = parseTicketBlocks(definition.body)
  const names = segments.flatMap((segment) =>
    TicketBlockSegment.$is("block")(segment) &&
    (segment.content.trim() !== "" || lookup(segment.type) !== undefined)
      ? [blockChrome(segment.type, lookup).name]
      : []
  )
  if (names.length > 0)
    return TypeStart.sections({ names: [...new Set(names)] })
  return segments.some(
    (segment) =>
      TicketBlockSegment.$is("markdown")(segment) && segment.text.trim() !== ""
  )
    ? TypeStart.text()
    : TypeStart.empty()
}

export const typePrediction = (
  library: Library | null,
  type: TypeKey | null
) => {
  const definition =
    library === null || type === null ? null : typeFor(library, type)
  return definition === null
    ? undefined
    : ({
        priority: definition.priority,
        tags: definition.tags
      } satisfies TypePrediction)
}

export const startingTypes = (
  types: ReadonlyArray<TypeDefinition>,
  current: TypeKey | null
) => {
  const offered = visibleTypes(types, current !== null && isEpicType(current))
  return [
    ...offered.filter((type) => type.key === current),
    ...offered.filter((type) => type.key !== current)
  ]
}
