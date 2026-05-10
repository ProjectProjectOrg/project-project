import { Data, Effect, ParseResult, Schema } from "effect"

export type ValidationIssueCode =
  | "required"
  | "invalid_type"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "invalid_value"

export type ValidationIssue = {
  readonly path: ReadonlyArray<string | number>
  readonly code: ValidationIssueCode
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly issues: ReadonlyArray<ValidationIssue>
}> {}

export const validate = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  value: unknown
): Effect.Effect<A, ValidationError, R> =>
  Schema.decodeUnknown(schema, { errors: "all" })(value).pipe(
    Effect.mapError(parseErrorToValidationError)
  )

export const parseErrorToValidationError = (
  error: ParseResult.ParseError
): ValidationError =>
  new ValidationError({ issues: issuesFromParseIssue(error.issue, []) })

const issuesFromParseIssue = (
  issue: ParseResult.ParseIssue,
  path: ReadonlyArray<string | number>
): ReadonlyArray<ValidationIssue> => {
  switch (issue._tag) {
    case "Pointer":
      return issuesFromParseIssue(issue.issue, [
        ...path,
        ...pathSegments(issue.path)
      ])
    case "Composite":
      return toArray(issue.issues).flatMap((child) =>
        issuesFromParseIssue(child, path)
      )
    case "Refinement":
    case "Transformation":
      return issuesFromParseIssue(issue.issue, path)
    case "Missing":
      return [{ path, code: "required" }]
    case "Unexpected":
      return [{ path, code: "invalid_value" }]
    case "Forbidden":
      return [{ path, code: "invalid_value" }]
    case "Type":
      return [{ path, code: codeFromTypeIssue(issue) }]
  }
}

const pathSegments = (path: ParseResult.Path): ReadonlyArray<string | number> =>
  toArray(path).map((segment) =>
    typeof segment === "string" || typeof segment === "number"
      ? segment
      : String(segment)
  )

const toArray = <A>(value: A | ReadonlyArray<A>): ReadonlyArray<A> => {
  if (Array.isArray(value)) return value
  return [value as A]
}

const codeFromTypeIssue = (issue: ParseResult.Type): ValidationIssueCode => {
  const expected = String(issue.ast)
  if (expected.includes("minLength")) return "too_short"
  if (expected.includes("maxLength")) return "too_long"
  if (expected.includes("pattern")) return "invalid_format"
  if (expected.includes(" | ") || expected.startsWith('"'))
    return "invalid_value"
  return "invalid_type"
}
