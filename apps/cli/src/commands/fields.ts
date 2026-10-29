import type { Tool } from "effect/ai"
import { Tool as ToolModule } from "effect/ai"
import * as Schema from "effect/Schema"

export type FieldKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "strings"
  | "json"

export type Field = Readonly<{
  name: string
  kind: FieldKind
  required: boolean
  nullable: boolean
  choices: ReadonlyArray<string> | undefined
  description: string | undefined
}>

const ObjectSchema = Schema.Struct({
  properties: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  required: Schema.optional(Schema.Array(Schema.String))
})

const Typed = Schema.Struct({
  type: Schema.Literals(["string", "integer", "number", "boolean", "array"]),
  items: Schema.optional(Schema.Unknown)
})
const Alternatives = Schema.Struct({ anyOf: Schema.Array(Schema.Unknown) })
const Enumerated = Schema.Struct({ enum: Schema.Array(Schema.String) })
const Described = Schema.Struct({ description: Schema.String })
const NullType = Schema.Struct({ type: Schema.Literal("null") })

const isTyped = Schema.is(Typed)
const isAlternatives = Schema.is(Alternatives)
const isDescribed = Schema.is(Described)
const isEnumerated = Schema.is(Enumerated)
const isNull = Schema.is(NullType)
const decodeObject = Schema.decodeUnknownSync(ObjectSchema)

const kindOf = (schema: unknown): FieldKind => {
  if (isAlternatives(schema)) {
    const options = schema.anyOf.filter((option) => !isNull(option))
    const kinds = new Set(options.map(kindOf))
    const [only] = kinds
    return kinds.size === 1 && only !== undefined ? only : "json"
  }
  if (!isTyped(schema)) return "json"
  if (schema.type !== "array") return schema.type
  return kindOf(schema.items) === "string" ? "strings" : "json"
}

const choicesOf = (schema: unknown): ReadonlyArray<string> | undefined => {
  if (isAlternatives(schema)) {
    const options = schema.anyOf.filter((option) => !isNull(option))
    const choices = options.map(choicesOf)
    return choices.every((found) => found !== undefined)
      ? choices.flat()
      : undefined
  }
  if (isEnumerated(schema)) return schema.enum
  return isTyped(schema) && schema.type === "array"
    ? choicesOf(schema.items)
    : undefined
}

const descriptionOf = (schema: unknown): string | undefined => {
  if (isDescribed(schema)) return schema.description
  if (!isAlternatives(schema)) return undefined
  return schema.anyOf
    .filter((option) => !isNull(option))
    .map(descriptionOf)
    .find((found) => found !== undefined)
}

const allowsNull = (schema: unknown) =>
  isAlternatives(schema) && schema.anyOf.some((option) => isNull(option))

const isClearable = (schema: unknown, required: boolean) =>
  required
    ? allowsNull(schema)
    : isAlternatives(schema) &&
      schema.anyOf.some((option) => !isNull(option) && allowsNull(option))

export const fieldsOf = (tool: Tool.Any): ReadonlyArray<Field> => {
  const schema = decodeObject(ToolModule.getJsonSchema(tool))
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    kind: kindOf(property),
    required: required.has(name),
    nullable: isClearable(property, required.has(name)),
    choices: choicesOf(property),
    description: descriptionOf(property)
  }))
}

export const flagName = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
