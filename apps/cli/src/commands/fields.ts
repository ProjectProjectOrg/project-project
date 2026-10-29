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
const Described = Schema.Struct({ description: Schema.String })
const NullType = Schema.Struct({ type: Schema.Literal("null") })

const isTyped = Schema.is(Typed)
const isAlternatives = Schema.is(Alternatives)
const isDescribed = Schema.is(Described)
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

export const fieldsOf = (tool: Tool.Any): ReadonlyArray<Field> => {
  const schema = decodeObject(ToolModule.getJsonSchema(tool))
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    kind: kindOf(property),
    required: required.has(name),
    description: isDescribed(property) ? property.description : undefined
  }))
}

export const flagName = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
