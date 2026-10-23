import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

type Tagged = Readonly<{ _tag: string; reason?: unknown }>

export const isUnknownTemplate = (error: Tagged): boolean =>
  Predicate.isTagged(error, "Validation") &&
  "reason" in error &&
  typeof error.reason === "string" &&
  error.reason.startsWith("unknown_template")

const explains = (error: Tagged): boolean =>
  Predicate.isTagged(error, "MentionInvalid") || isUnknownTemplate(error)

export const creatorErrorText = (
  result: AsyncResult.AsyncResult<unknown, Tagged>
): string | null =>
  AsyncResult.isFailure(result)
    ? AsyncResult.matchWithError(result, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) =>
          explains(error)
            ? errorMessage(error)
            : m.tickets_create_error_fallback(),
        onDefect: () => m.tickets_create_error_fallback()
      })
    : null

export const failedOnUnknownTemplate = (
  exit: Exit.Exit<unknown, Tagged>
): boolean =>
  Exit.isFailure(exit) &&
  Option.exists(Cause.findErrorOption(exit.cause), isUnknownTemplate)
