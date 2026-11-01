import * as Effect from "effect/Effect"

export function withProjectTelemetry<A, E, R>(
  operation: string,
  orgSlug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  const annotations = { module: "Projects", operation, orgSlug, ...attributes }
  return effect.pipe(
    Effect.withSpan(`Projects.${operation}`, { attributes: annotations }),
    Effect.annotateLogs(annotations)
  )
}

export function annotateProjectTelemetry<A, E, R>(
  operation: string,
  orgSlug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  const annotations = { module: "Projects", operation, orgSlug, ...attributes }
  return Effect.annotateCurrentSpan(annotations).pipe(
    Effect.andThen(effect),
    Effect.annotateLogs(annotations)
  )
}
