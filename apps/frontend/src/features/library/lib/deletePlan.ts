import {
  isEpicType,
  NO_TYPE_FILTER,
  TypeKey,
  type Library,
  type TypeDefinition
} from "@pp/shared"
import * as Schema from "effect/Schema"

export const NO_TYPE = NO_TYPE_FILTER

const isTypeKey = Schema.is(TypeKey)

export const replacementTypes = (
  library: Library,
  deleting: string
): ReadonlyArray<TypeDefinition> =>
  library.types.filter(
    (type) => !type.hidden && type.key !== deleting && !isEpicType(type.key)
  )

export const replacementKey = (choice: string): TypeKey | null =>
  choice !== NO_TYPE && isTypeKey(choice) ? choice : null

export const ticketsToMove = (
  counts: ReadonlyArray<Readonly<{ total: number }>>
): number => counts.reduce((sum, count) => sum + count.total, 0)
