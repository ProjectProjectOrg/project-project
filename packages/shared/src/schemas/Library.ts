import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { TAG_COLOR_WHEEL } from "../colors"
import { BLOCK_ICONS } from "../library/icons"
import { BlockKey, TemplateKey } from "./LibraryKey"
import { TagName } from "./Tag"
import { TicketPriority, TicketType } from "./Ticket"

export {
  BLANK_TEMPLATE_KEY,
  BlockKey,
  LIBRARY_KEY_MAX_LENGTH,
  TemplateKey
} from "./LibraryKey"

const WHEEL_HEXES: ReadonlySet<string> = new Set(
  TAG_COLOR_WHEEL.map((swatch) => swatch.hex)
)

export const isWheelHex = (value: string): boolean =>
  WHEEL_HEXES.has(value.toLowerCase())

export const LibraryOrigin = Schema.Literals(["org", "project"])
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

const templateFields = {
  name: LibraryName,
  icon: BlockIcon,
  color: optionalColor,
  description: LibraryDescription,
  type: Schema.NullOr(TicketType),
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

export const TemplateDraft = Schema.Struct({
  key: TemplateKey,
  ...templateFields
})
export type TemplateDraft = typeof TemplateDraft.Type

export const BlockDefinition = Schema.Struct({
  key: BlockKey,
  ...blockFields,
  ...layerFields
})
export type BlockDefinition = typeof BlockDefinition.Type

export const TemplateDefinition = Schema.Struct({
  key: TemplateKey,
  ...templateFields,
  ...layerFields
})
export type TemplateDefinition = typeof TemplateDefinition.Type

const defaultTemplate = Schema.NullOr(TemplateKey)

export const TemplateDefaults = Schema.Struct({
  feat: defaultTemplate,
  bug: defaultTemplate,
  chore: defaultTemplate,
  other: defaultTemplate
})
export type TemplateDefaults = typeof TemplateDefaults.Type

export const PartialTemplateDefaults = Schema.Struct({
  feat: Schema.optionalKey(defaultTemplate),
  bug: Schema.optionalKey(defaultTemplate),
  chore: Schema.optionalKey(defaultTemplate),
  other: Schema.optionalKey(defaultTemplate)
})
export type PartialTemplateDefaults = typeof PartialTemplateDefaults.Type

export const LibraryDefaults = Schema.Struct({
  defaults: TemplateDefaults,
  ownDefaults: PartialTemplateDefaults,
  inheritedDefaults: TemplateDefaults
})
export type LibraryDefaults = typeof LibraryDefaults.Type

export const Library = Schema.Struct({
  blocks: Schema.Array(BlockDefinition),
  templates: Schema.Array(TemplateDefinition),
  ...LibraryDefaults.fields,
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

export const CreateTemplateInput = TemplateDraft
export type CreateTemplateInput = typeof CreateTemplateInput.Type

export const UpdateTemplateInput = Schema.Struct({
  name: Schema.optional(templateFields.name),
  icon: Schema.optional(templateFields.icon),
  color: Schema.optional(LibraryColor),
  description: Schema.optional(templateFields.description),
  type: Schema.optional(templateFields.type),
  priority: Schema.optional(templateFields.priority),
  tags: Schema.optional(templateFields.tags),
  body: Schema.optional(templateFields.body)
})
export type UpdateTemplateInput = typeof UpdateTemplateInput.Type

export const UpdateTemplateDefaultsInput = Schema.Struct({
  defaults: PartialTemplateDefaults,
  reset: Schema.optional(Schema.Array(TicketType))
})
export type UpdateTemplateDefaultsInput =
  typeof UpdateTemplateDefaultsInput.Type
