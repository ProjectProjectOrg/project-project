import * as Effect from "effect/Effect"

export const dieOnMarkdown = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  eff.pipe(
    Effect.catchTags({
      MarkdownError: (cause: unknown) => Effect.die(cause),
      MalformedTicketDocument: (cause: unknown) => Effect.die(cause)
    })
  )
