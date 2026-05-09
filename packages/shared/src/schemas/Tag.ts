import { Schema } from "effect"

export const TagName = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9][a-z0-9 -]{0,30}$/),
  Schema.maxLength(31),
  Schema.brand("TagName"),
  Schema.annotations({ identifier: "TagName" })
)
export type TagName = typeof TagName.Type

export const TagColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i),
  Schema.brand("TagColor"),
  Schema.annotations({ identifier: "TagColor" })
)
export type TagColor = typeof TagColor.Type

export const Tag = Schema.Struct({
  name: TagName,
  color: TagColor,
  createdBy: Schema.String,
  createdAt: Schema.Date
})
export type Tag = typeof Tag.Type

export const CreateTagInput = Schema.Struct({
  name: TagName,
  color: Schema.optional(TagColor)
})
export type CreateTagInput = typeof CreateTagInput.Type

export const UpdateTagInput = Schema.Struct({
  name: Schema.optional(TagName),
  color: Schema.optional(TagColor)
})
export type UpdateTagInput = typeof UpdateTagInput.Type
