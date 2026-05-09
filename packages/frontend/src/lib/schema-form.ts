import {
  Cause,
  Either,
  JSONSchema,
  Option,
  ParseResult,
  Schema,
  SchemaAST
} from "effect"
import { HttpApiError } from "@effect/platform"
import { m } from "@/paraglide/messages"
import { SCHEMA_HINTS } from "@/lib/schema-hints"

export type InputAttrs = {
  pattern?: string
  minLength?: number
  maxLength?: number
}

export const validate = <A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown
): Either.Either<A, ReadonlyArray<ParseResult.ArrayFormatterIssue>> =>
  Either.mapLeft(
    Schema.decodeUnknownEither(schema)(value),
    ParseResult.ArrayFormatter.formatErrorSync
  )

const refPrefix = "#/$defs/"

const decodeJsonPointerSegment = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~")

const resolveJsonSchema = (
  schema: JSONSchema.JsonSchema7,
  root: JSONSchema.JsonSchema7Root
): JSONSchema.JsonSchema7 => {
  if ("$ref" in schema && schema.$ref.startsWith(refPrefix)) {
    const key = decodeJsonPointerSegment(schema.$ref.slice(refPrefix.length))
    return root.$defs?.[key] ?? schema
  }
  return schema
}

const collectInputAttrs = (value: unknown, attrs: InputAttrs) => {
  if (typeof value !== "object" || value === null) return
  const source = value as {
    readonly pattern?: unknown
    readonly minLength?: unknown
    readonly maxLength?: unknown
    readonly allOf?: unknown
  }
  if (typeof source.pattern === "string" && attrs.pattern === undefined) {
    attrs.pattern = source.pattern
  }
  if (typeof source.minLength === "number") {
    attrs.minLength =
      attrs.minLength === undefined
        ? source.minLength
        : Math.max(attrs.minLength, source.minLength)
  }
  if (typeof source.maxLength === "number") {
    attrs.maxLength =
      attrs.maxLength === undefined
        ? source.maxLength
        : Math.min(attrs.maxLength, source.maxLength)
  }
  if (Array.isArray(source.allOf)) {
    for (const item of source.allOf) collectInputAttrs(item, attrs)
  }
}

export const getInputAttrs = (schema: Schema.Schema.Any): InputAttrs => {
  const jsonSchema = JSONSchema.make(schema)
  const attrs: InputAttrs = {}
  collectInputAttrs(resolveJsonSchema(jsonSchema, jsonSchema), attrs)
  return attrs
}

export const hintFor = (identifier: string): string => {
  const hint = SCHEMA_HINTS[identifier]
  if (hint) return hint()
  if (import.meta.env.DEV) {
    console.warn(
      `[schema-form] no hint registered for identifier "${identifier}"`
    )
  }
  return m.validation_invalid_value()
}

const findIdentifier = (
  ast: SchemaAST.AST,
  path: ReadonlyArray<PropertyKey>
): string | undefined => {
  if (path.length === 0) {
    return Option.getOrUndefined(SchemaAST.getIdentifierAnnotation(ast))
  }
  if (SchemaAST.isRefinement(ast)) {
    return findIdentifier(ast.from, path)
  }
  if (SchemaAST.isTransformation(ast)) {
    return findIdentifier(ast.to, path)
  }
  if (SchemaAST.isTypeLiteral(ast)) {
    const [head, ...rest] = path
    const sig = ast.propertySignatures.find((p) => p.name === head)
    return sig ? findIdentifier(sig.type, rest) : undefined
  }
  if (SchemaAST.isTupleType(ast)) {
    const rest = path.slice(1)
    const element = ast.rest[0]?.type ?? ast.elements[0]?.type
    return element ? findIdentifier(element, rest) : undefined
  }
  return undefined
}

export type LocalizedIssue = {
  path: ReadonlyArray<PropertyKey>
  hint: string
}

export const localizeIssues = (
  issues: ReadonlyArray<ParseResult.ArrayFormatterIssue>,
  schema: Schema.Schema.Any
): ReadonlyArray<LocalizedIssue> =>
  issues.map((issue) => {
    const identifier = findIdentifier(schema.ast, issue.path)
    return {
      path: issue.path,
      hint: identifier ? hintFor(identifier) : m.validation_invalid_value()
    }
  })

export const getDecodeIssues = (
  cause: Cause.Cause<unknown>
): ReadonlyArray<ParseResult.ArrayFormatterIssue> | null => {
  const failure = Cause.failureOption(cause)
  if (Option.isNone(failure)) return null
  const error = failure.value
  if (error instanceof HttpApiError.HttpApiDecodeError) {
    return error.issues
  }
  return null
}
