import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core"
import * as Cause from "effect/Cause"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as SqlError from "effect/sql/SqlError"

const querySqlError = (
  error: EffectDrizzleQueryError
): Option.Option<SqlError.SqlError> =>
  SqlError.isSqlError(error.cause)
    ? Option.some(error.cause)
    : Cause.isCause(error.cause)
      ? Option.filter(Cause.findErrorOption(error.cause), SqlError.isSqlError)
      : Option.none()

export const uniqueConstraint = (
  error: EffectDrizzleQueryError,
  constraint: string
): boolean =>
  Option.match(querySqlError(error), {
    onNone: () => false,
    onSome: (sqlError) =>
      Match.value(sqlError.reason).pipe(
        Match.tag(
          "UniqueViolation",
          (reason) => reason.constraint === constraint
        ),
        Match.orElse(() => false)
      )
  })
