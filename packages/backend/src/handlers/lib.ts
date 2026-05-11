import * as Effect from "effect/Effect"
import type { MarkdownError } from "../Services/Markdown"

export const dieOnMarkdown = <A, E, R>(
  eff: Effect.Effect<A, MarkdownError | E, R>
) => eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
