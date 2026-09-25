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

export class JiraMigrationDefect extends Schema.TaggedError<JiraMigrationDefect>()(
  "JiraMigrationDefect",
  { defect: Schema.Defect() }
) {}

export const MAX_RETRY_AFTER_MILLIS = 86_400_000

export class JiraRateLimited extends Schema.TaggedError<JiraRateLimited>()(
  "JiraRateLimited",
  {
    operation: Schema.String,
    retryAfterMillis: Schema.Finite.check(
      Schema.isBetween({ minimum: 0, maximum: MAX_RETRY_AFTER_MILLIS })
    )
  }
) {}

export class JiraTransientFailure extends Schema.TaggedError<JiraTransientFailure>()(
  "JiraTransientFailure",
  {
    operation: Schema.String,
    reason: Schema.Literals([
      "network",
      "timeout",
      "server_error",
      "invalid_retry_after"
    ])
  }
) {}
