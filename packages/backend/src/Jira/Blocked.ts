import * as Data from "effect/Data"

export class JiraMigrationBlocked extends Data.TaggedError(
  "JiraMigrationBlocked"
)<{
  readonly blockers: ReadonlyArray<{
    readonly code: string
    readonly subjectId: string
  }>
}> {}

export class JiraMigrationLeaseLost extends Data.TaggedError(
  "JiraMigrationLeaseLost"
)<{
  readonly migrationId: string
}> {}

export class JiraMigrationDefect extends Data.TaggedError(
  "JiraMigrationDefect"
)<{
  readonly defect: unknown
}> {}
