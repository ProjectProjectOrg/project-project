import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import type { TaggedFailure } from "./errors"

const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((ms) => Math.floor(ms / 1000))
)

export type GitHubRequestAttributes = Record<string, unknown> & {
  readonly tokenSource: "user" | "installation"
  readonly operation: string
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
      Effect.logWarning("github request failed").pipe(
        Effect.annotateLogs({ error: error._tag })
      )
    ),
    Effect.withSpan(`GitHub.${attributes.operation}`, {
      attributes: safeAttributes
    }),
    Effect.annotateLogs({ module: "GitHub", ...safeAttributes })
  )
}
