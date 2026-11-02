import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"

export type TracedSpan = Readonly<{ name: string; parent: string | null }>

// Runs the effect under a recording tracer and returns the Everhour service
// spans it opened, each with the name of its parent span (null at the root).
export const everhourSpans = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    yield* effect.pipe(Effect.withTracer(tracer))
    return spans.flatMap(
      (span): ReadonlyArray<TracedSpan> =>
        span.name.startsWith("Everhour")
          ? [
              {
                name: span.name,
                parent: Option.match(span.parent, {
                  onNone: () => null,
                  onSome: (parent) => ("name" in parent ? parent.name : null)
                })
              }
            ]
          : []
    )
  })
