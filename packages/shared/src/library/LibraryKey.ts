import * as Schema from "effect/Schema"

import { TICKET_BLOCK_TYPE_PATTERN } from "../tickets/blocks"

export const LIBRARY_KEY_MAX_LENGTH = 48

export const BLANK_TYPE_KEY = "blank"

export const RESERVED_TYPE_KEYS: ReadonlyArray<string> = [
  "other",
  BLANK_TYPE_KEY
]

export const isReservedTypeKey = (key: string): boolean =>
  RESERVED_TYPE_KEYS.includes(key)

const libraryKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(TICKET_BLOCK_TYPE_PATTERN)),
  Schema.check(Schema.isMaxLength(LIBRARY_KEY_MAX_LENGTH))
)

export const BlockKey = libraryKey.pipe(Schema.brand("BlockKey"))
export type BlockKey = typeof BlockKey.Type

export const TypeKey = libraryKey.pipe(
  Schema.check(Schema.makeFilter((key: string) => !isReservedTypeKey(key))),
  Schema.brand("TypeKey")
)
export type TypeKey = typeof TypeKey.Type
