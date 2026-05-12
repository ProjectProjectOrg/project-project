import * as Effect from "effect/Effect"

export const dieOnMarkdown = <A, E, R>(
  eff: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  Exclude<
    E,
    { readonly _tag: "MarkdownError" | "MalformedTicketDocument" }
  >,
  R
> =>
  eff.pipe(
    Effect.catchTags({
      MarkdownError: (cause: unknown) => Effect.die(cause),
      // TODO: return MalformedTicketDocument as a typed API diagnostic once ticket lists expose recoverable document errors.
      MalformedTicketDocument: (cause: unknown) => Effect.die(cause)
    })
  ) as Effect.Effect<
    A,
    Exclude<
      E,
      { readonly _tag: "MarkdownError" | "MalformedTicketDocument" }
    >,
    R
  >
