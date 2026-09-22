import * as Schema from "effect/Schema"

export class JiraMigrationBlocked extends Schema.TaggedError<JiraMigrationBlocked>()(
  "JiraMigrationBlocked",
  {
    blockers: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        subjectId: Schema.String
      })
    )
  }
) {}

export class JiraMigrationLeaseLost extends Schema.TaggedError<JiraMigrationLeaseLost>()(
  "JiraMigrationLeaseLost",
  { migrationId: Schema.String }
) {}

export class JiraMigrationDefect extends Schema.TaggedError<JiraMigrationDefect>()(
  "JiraMigrationDefect",
  { defect: Schema.Defect() }
) {}
