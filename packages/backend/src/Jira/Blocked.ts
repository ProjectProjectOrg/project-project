import * as Data from "effect/Data"

export class JiraMigrationBlocked extends Data.TaggedError(
  "JiraMigrationBlocked"
)<{
  readonly blockers: ReadonlyArray<{
    readonly code: string
    readonly subjectId: string
  }>
}> {}
