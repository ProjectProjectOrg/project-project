import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
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
const MIN_RETRY_AFTER_MILLIS = 1_000
const DEFAULT_RETRY_AFTER_MILLIS = 15_000

const RetryAfterMillis = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_RETRY_AFTER_MILLIS })
)

export const RetryAfterSource = Schema.Literals(["header", "default"])
export type RetryAfterSource = typeof RetryAfterSource.Type

export class JiraRateLimited extends Schema.TaggedError<JiraRateLimited>()(
  "JiraRateLimited",
  {
    operation: Schema.String,
    retryAfterMillis: RetryAfterMillis,
    retryAfterSource: Schema.optional(RetryAfterSource),
    limitReason: Schema.optional(Schema.String)
  }
) {}

export class JiraTransientFailure extends Schema.TaggedError<JiraTransientFailure>()(
  "JiraTransientFailure",
  {
    operation: Schema.String,
    reason: Schema.Literals(["network", "timeout", "server_error"]),
    status: Schema.optional(Schema.Int),
    retryAfterMillis: Schema.optional(RetryAfterMillis)
  }
) {}

const RetryAfterSeconds = Schema.String.check(Schema.isPattern(/^\d+$/))
const decodeRetryAfterSeconds = Schema.decodeUnknownOption(RetryAfterSeconds)

const ImfDatePattern =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}:\d{2}:\d{2}) GMT$/
const Rfc850DatePattern =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/
const AsctimeDatePattern =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d{2}) (\d{2}:\d{2}:\d{2}) (\d{4})$/
const RetryAfterDate = Schema.Union([
  Schema.String.check(Schema.isPattern(ImfDatePattern)),
  Schema.String.check(Schema.isPattern(Rfc850DatePattern)),
  Schema.String.check(Schema.isPattern(AsctimeDatePattern))
])
const decodeRetryAfterDate = Schema.decodeUnknownOption(RetryAfterDate)

const httpDateMillis = (header: string, now: number) => {
  const decoded = decodeRetryAfterDate(header)
  if (Option.isNone(decoded)) return null
  let canonical = decoded.value
  const rfc850 = canonical.match(Rfc850DatePattern)
  const asctime = canonical.match(AsctimeDatePattern)
  if (rfc850) {
    const limit = DateTime.add(DateTime.makeUnsafe(now), { years: 50 })
    let year =
      Math.floor(DateTime.toPartsUtc(limit).year / 100) * 100 +
      Number(rfc850[4])
    const normalized = () =>
      `${rfc850[1].slice(0, 3)}, ${rfc850[2]} ${rfc850[3]} ${year} ${rfc850[5]} GMT`
    const candidate = DateTime.make(normalized())
    if (
      Option.isSome(candidate) &&
      DateTime.toEpochMillis(candidate.value) > DateTime.toEpochMillis(limit)
    )
      year -= 100
    canonical = normalized()
  } else if (asctime) {
    canonical = `${asctime[1]}, ${asctime[3].trim().padStart(2, "0")} ${asctime[2]} ${asctime[5]} ${asctime[4]} GMT`
  }
  const date = DateTime.make(canonical)
  return Option.isSome(date) &&
    DateTime.toDateUtc(date.value).toUTCString() === canonical
    ? DateTime.toEpochMillis(date.value) - now
    : null
}

export const parseRetryAfter = (
  header: string | undefined,
  now: number
): number | null => {
  if (header === undefined) return null
  const trimmed = header.trim()
  const seconds = decodeRetryAfterSeconds(trimmed)
  const millis = Option.isSome(seconds)
    ? Number(seconds.value) * 1000
    : httpDateMillis(trimmed, now)
  return millis === null || !Number.isFinite(millis)
    ? null
    : Math.min(MAX_RETRY_AFTER_MILLIS, Math.max(0, millis))
}

export const rateLimitFromHeaders = (
  operation: string,
  headers: Readonly<Record<string, string>>,
  now: number
): JiraRateLimited => {
  const parsed = parseRetryAfter(headers["retry-after"], now)
  const limitReason = headers["ratelimit-reason"]
  return new JiraRateLimited({
    operation,
    retryAfterMillis:
      parsed === null
        ? DEFAULT_RETRY_AFTER_MILLIS
        : Math.max(MIN_RETRY_AFTER_MILLIS, parsed),
    retryAfterSource: parsed === null ? "default" : "header",
    ...(limitReason === undefined ? {} : { limitReason })
  })
}
