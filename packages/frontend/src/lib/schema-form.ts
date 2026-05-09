import { Cause, Either, Option, ParseResult, Schema, SchemaAST } from "effect"
import { HttpApiError } from "@effect/platform"
import { m } from "@/paraglide/messages"
import { SCHEMA_HINTS } from "@/lib/schema-hints"

export type InputAttrs = {
  pattern?: RegExp
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

export const getInputAttrs = (schema: Schema.Schema.Any): InputAttrs => {
  const attrs: InputAttrs = {}
  let ast: SchemaAST.AST = schema.ast
  while (SchemaAST.isRefinement(ast)) {
    const patternAnn = ast.annotations[Schema.PatternSchemaId]
    if (
      attrs.pattern === undefined &&
      typeof patternAnn === "object" &&
      patternAnn !== null &&
      "regex" in patternAnn &&
      patternAnn.regex instanceof RegExp
    ) {
      attrs.pattern = patternAnn.regex
    }
    const json = ast.annotations[SchemaAST.JSONSchemaAnnotationId]
    if (typeof json === "object" && json !== null) {
      if (
        attrs.maxLength === undefined &&
        "maxLength" in json &&
        typeof json.maxLength === "number"
      ) {
        attrs.maxLength = json.maxLength
      }
      if (
        attrs.minLength === undefined &&
        "minLength" in json &&
        typeof json.minLength === "number"
      ) {
        attrs.minLength = json.minLength
      }
    }
    ast = ast.from
  }
  return attrs
}

export const hintFor = (identifier: string): string => {
  const hint = SCHEMA_HINTS[identifier]
  if (hint) return hint()
  if (import.meta.env.DEV) {
    console.warn(`[schema-form] no hint registered for identifier "${identifier}"`)
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
    const element =
      ast.rest[0]?.type ?? ast.elements[0]?.type
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
