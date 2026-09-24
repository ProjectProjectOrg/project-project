import * as Schema from "effect/Schema"

import { TICKET_BLOCK_TYPE_PATTERN } from "../ticketBlocks"

export const LIBRARY_KEY_MAX_LENGTH = 48

export const BLANK_TEMPLATE_KEY = "blank"

const libraryKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(TICKET_BLOCK_TYPE_PATTERN)),
  Schema.check(Schema.isMaxLength(LIBRARY_KEY_MAX_LENGTH))
)

export const BlockKey = libraryKey.pipe(Schema.brand("BlockKey"))
export type BlockKey = typeof BlockKey.Type

export const TemplateKey = libraryKey.pipe(
  Schema.check(Schema.makeFilter((key: string) => key !== BLANK_TEMPLATE_KEY)),
  Schema.brand("TemplateKey")
)
export type TemplateKey = typeof TemplateKey.Type
