import { Effect } from "effect"
import {
  CreateTagInput as CreateTagInputSchema,
  TagName as TagNameSchema,
  UpdateTagInput as UpdateTagInputSchema,
  type CreateTagInput,
  type TagName,
  type UpdateTagInput
} from "@projectproject/shared"
import { validate, type ValidationError } from "@/lib/validation"

export type RawCreateTagInput = {
  readonly name: string
  readonly color?: unknown
}

export type RawUpdateTagInput = {
  readonly name?: string
  readonly color?: unknown
}

export const normalizeTagNameInput = (raw: string): string =>
  raw.trim().toLowerCase()

export const validateTagName = (
  raw: string
): Effect.Effect<TagName, ValidationError> =>
  validate(TagNameSchema, normalizeTagNameInput(raw))

export const validateCreateTagInput = (
  raw: RawCreateTagInput
): Effect.Effect<CreateTagInput, ValidationError> =>
  validate(CreateTagInputSchema, {
    name: normalizeTagNameInput(raw.name),
    ...(raw.color === undefined ? {} : { color: raw.color })
  })

export const validateUpdateTagInput = (
  raw: RawUpdateTagInput
): Effect.Effect<UpdateTagInput, ValidationError> =>
  validate(UpdateTagInputSchema, {
    ...(raw.name === undefined
      ? {}
      : { name: normalizeTagNameInput(raw.name) }),
    ...(raw.color === undefined ? {} : { color: raw.color })
  })
