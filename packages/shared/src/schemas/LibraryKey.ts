import * as Schema from "effect/Schema"

import { TICKET_BLOCK_TYPE_PATTERN } from "../ticketBlocks"

export const LIBRARY_KEY_MAX_LENGTH = 48

const libraryKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(TICKET_BLOCK_TYPE_PATTERN)),
  Schema.check(Schema.isMaxLength(LIBRARY_KEY_MAX_LENGTH))
)

export const BlockKey = libraryKey.pipe(Schema.brand("BlockKey"))
export type BlockKey = typeof BlockKey.Type
