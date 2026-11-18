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

export type TypeStart =
  | Readonly<{ kind: "sections"; names: ReadonlyArray<string> }>
  | Readonly<{ kind: "text" }>
  | Readonly<{ kind: "empty" }>

export const typeStart = (
  definition: TypeDefinition | null,
  lookup: BlockLookup
) => {
  if (definition === null) return { kind: "empty" } satisfies TypeStart
  const segments = parseTicketBlocks(definition.body)
  const names = segments.flatMap((segment) =>
    TicketBlockSegment.$is("block")(segment) &&
    (segment.content.trim() !== "" || lookup(segment.type) !== undefined)
      ? [blockChrome(segment.type, lookup).name]
      : []
  )
  if (names.length > 0)
    return {
      kind: "sections",
      names: [...new Set(names)]
    } satisfies TypeStart
  return segments.some(
    (segment) =>
      TicketBlockSegment.$is("markdown")(segment) && segment.text.trim() !== ""
  )
    ? ({ kind: "text" } satisfies TypeStart)
    : ({ kind: "empty" } satisfies TypeStart)
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
