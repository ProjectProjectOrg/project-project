import {
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
  SlackAuthInvalid,
  SlackError,
  SlackNotConnected,
  SlackRateLimited
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"

import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const isExpectedError = Schema.is(
  Schema.Union([
    Conflict,
    Forbidden,
    NotFound,
    Unauthorized,
    SlackAuthInvalid,
    SlackError,
    SlackNotConnected,
    SlackRateLimited
  ])
)

export const slackActionError = (
  result: Result.AsyncResult<unknown, unknown>
): string | null =>
  Result.matchWithError(result, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) =>
      isExpectedError(error) ? errorMessage(error) : m.slack_error_generic(),
    onDefect: () => m.error_unknown()
  })
