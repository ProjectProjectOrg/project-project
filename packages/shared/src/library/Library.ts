import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { TAG_COLOR_WHEEL } from "../colors"
import { TagName } from "../tags/Tag"
import { TicketPriority } from "../tickets/Ticket"
import { BLOCK_ICONS } from "./icons"
import { BlockKey, TypeKey } from "./LibraryKey"

export {
  BLANK_TYPE_KEY,
  BlockKey,
  isReservedTypeKey,
  LIBRARY_KEY_MAX_LENGTH,
  NO_TYPE_FILTER,
  RESERVED_TYPE_KEYS,
  TypeKey
} from "./LibraryKey"

const WHEEL_HEXES: ReadonlySet<string> = new Set(
  TAG_COLOR_WHEEL.map((swatch) => swatch.hex)
)

export const isWheelHex = (value: string): boolean =>
  WHEEL_HEXES.has(value.toLowerCase())

export const LibraryOrigin = Schema.Literals(["builtin", "org", "project"])
export type LibraryOrigin = typeof LibraryOrigin.Type

export const BlockIcon = Schema.Literals(BLOCK_ICONS)
export type BlockIcon = typeof BlockIcon.Type

export const LibraryColor = Schema.NullOr(
  Schema.String.pipe(Schema.check(Schema.makeFilter(isWheelHex)))
)
export type LibraryColor = typeof LibraryColor.Type

const optionalColor = LibraryColor.pipe(
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)

export const LibraryName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(60))
)

export const LibraryDescription = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(200))
)

export const LibraryContent = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(20_000))
)

const blockFields = {
  name: LibraryName,
  icon: BlockIcon,
  color: optionalColor,
  description: LibraryDescription,
  sync: Schema.Boolean,
  content: LibraryContent
}

const typeFields = {
  name: LibraryName,
  icon: BlockIcon,
  color: optionalColor,
  description: LibraryDescription,
  priority: Schema.NullOr(TicketPriority),
  tags: Schema.Array(TagName),
  body: LibraryContent
}

const layerFields = {
  origin: LibraryOrigin,
  shadows: Schema.NullOr(LibraryOrigin),
  hidden: Schema.Boolean
}

export const BlockDraft = Schema.Struct({ key: BlockKey, ...blockFields })
export type BlockDraft = typeof BlockDraft.Type

export const TypeDraft = Schema.Struct({
  key: TypeKey,
  ...typeFields
})
export type TypeDraft = typeof TypeDraft.Type

export const BlockDefinition = Schema.Struct({
  key: BlockKey,
  ...blockFields,
  ...layerFields
})
export type BlockDefinition = typeof BlockDefinition.Type

export const TypeDefinition = Schema.Struct({
  key: TypeKey,
  ...typeFields,
  ...layerFields
})
export type TypeDefinition = typeof TypeDefinition.Type

export const Library = Schema.Struct({
  blocks: Schema.Array(BlockDefinition),
  types: Schema.Array(TypeDefinition),
  canEdit: Schema.Boolean
})
export type Library = typeof Library.Type

export const CreateBlockInput = BlockDraft
export type CreateBlockInput = typeof CreateBlockInput.Type

export const UpdateBlockInput = Schema.Struct({
  name: Schema.optional(blockFields.name),
  icon: Schema.optional(blockFields.icon),
  color: Schema.optional(LibraryColor),
  description: Schema.optional(blockFields.description),
  sync: Schema.optional(blockFields.sync),
  content: Schema.optional(blockFields.content)
})
export type UpdateBlockInput = typeof UpdateBlockInput.Type

export const CreateTypeInput = TypeDraft
export type CreateTypeInput = typeof CreateTypeInput.Type

export const UpdateTypeInput = Schema.Struct({
  name: Schema.optional(typeFields.name),
  icon: Schema.optional(typeFields.icon),
  color: Schema.optional(LibraryColor),
  description: Schema.optional(typeFields.description),
  priority: Schema.optional(typeFields.priority),
  tags: Schema.optional(typeFields.tags),
  body: Schema.optional(typeFields.body)
})
export type UpdateTypeInput = typeof UpdateTypeInput.Type
