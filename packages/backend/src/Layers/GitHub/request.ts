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

export const githubRequest = <A, EOut extends TaggedFailure>(
  attributes: GitHubRequestAttributes,
  fn: (signal: AbortSignal) => Promise<A>,
  narrowErr: (cause: unknown, now: number) => EOut
): Effect.Effect<A, EOut> =>
  Effect.gen(function* () {
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
    Effect.withSpan(`GitHub.${attributes.operation}`, { attributes }),
    Effect.annotateLogs({ module: "GitHub", ...attributes })
  )
