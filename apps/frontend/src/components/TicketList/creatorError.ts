import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

import { errorMessage, type AppError } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

type Tagged = Readonly<{ _tag: string; reason?: unknown }>

export const isUnknownTemplate = (error: Tagged): boolean =>
  error._tag === "Validation" &&
  typeof error.reason === "string" &&
  error.reason.startsWith("unknown_template")

const explains = (error: Tagged): boolean =>
  error._tag === "MentionInvalid" || isUnknownTemplate(error)

export const creatorErrorText = (
  result: AsyncResult.AsyncResult<unknown, Tagged>
): string | null =>
  AsyncResult.isFailure(result)
    ? AsyncResult.matchWithError(result, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) =>
          explains(error)
            ? errorMessage(error as AppError)
            : m.tickets_create_error_fallback(),
        onDefect: () => m.tickets_create_error_fallback()
      })
    : null

export const failedOnUnknownTemplate = (
  exit: Exit.Exit<unknown, Tagged>
): boolean =>
  Exit.isFailure(exit) &&
  Option.exists(Cause.findErrorOption(exit.cause), isUnknownTemplate)
