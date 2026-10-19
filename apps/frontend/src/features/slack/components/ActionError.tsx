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
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function SlackActionError({
  result
}: Readonly<{ result: Result.AsyncResult<unknown, unknown> }>) {
  const message = Result.matchWithError(result, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) =>
      Schema.is(
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
      )(error)
        ? errorMessage(error)
        : m.slack_error_generic(),
    onDefect: () => m.error_unknown()
  })
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}
