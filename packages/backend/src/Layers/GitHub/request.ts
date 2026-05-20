import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import type { TaggedFailure } from "./errors"

const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((ms) => Math.floor(ms / 1000))
)

export type GitHubRequestAttributes = Record<string, unknown> & {
  readonly tokenSource: "user" | "installation"
  readonly operation: string
  readonly failureLogLevel?: "debug" | "warning"
}

const telemetryAttributeKeys = [
  "tokenSource",
  "operation",
  "installationId",
  "repoOwner",
  "repoName",
  "page",
  "first",
  "branches"
] as const

const telemetryAttributes = (
  attributes: GitHubRequestAttributes
): Record<string, unknown> =>
  Object.fromEntries(
    telemetryAttributeKeys.flatMap((key) =>
      key in attributes ? [[key, attributes[key]]] : []
    )
  )

const failureAttributes = (error: TaggedFailure): Record<string, unknown> => ({
  error: error._tag,
  ...("message" in error &&
  typeof error.message === "string" &&
  error.message.length > 0
    ? { errorMessage: error.message }
    : {})
})

export const githubRequest = <A, EOut extends TaggedFailure>(
  attributes: GitHubRequestAttributes,
  fn: (signal: AbortSignal) => Promise<A>,
  narrowErr: (cause: unknown, now: number) => EOut
): Effect.Effect<A, EOut> => {
  const safeAttributes = telemetryAttributes(attributes)
  return Effect.gen(function* () {
    const now = yield* nowSeconds
    return yield* Effect.tryPromise({
      try: fn,
      catch: (cause) => narrowErr(cause, now)
    })
  }).pipe(
    Effect.tapError((error) =>
      (attributes.failureLogLevel === "debug"
        ? Effect.logDebug("github request failed")
        : Effect.logWarning("github request failed")
      ).pipe(Effect.annotateLogs(failureAttributes(error)))
    ),
    Effect.withSpan(`GitHub.${attributes.operation}`, {
      attributes: safeAttributes
    }),
    Effect.annotateLogs({ module: "GitHub", ...safeAttributes })
  )
}
