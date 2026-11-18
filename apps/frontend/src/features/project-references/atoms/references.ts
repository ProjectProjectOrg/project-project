import type { FixReferenceInput, ReferenceKind } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"
import { withoutFixed } from "@/features/project-references/lib/referenceGroups"

export type ReferencesRequest = ReturnType<typeof referencesRequest>

export const referencesRequest = (orgSlug: string, slug: string) =>
  ({
    _view: "references",
    params: { orgSlug, slug }
  }) as const

const referencesQuery = (req: ReferencesRequest) =>
  query("projectReferences", "list", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })

export const referencesToFix = Atom.family((req: ReferencesRequest) =>
  Atom.optimistic(referencesQuery(req))
)

export type FixReferenceKey = Readonly<{
  req: ReferencesRequest
  kind: ReferenceKind
  target: string
}>

export const fixReference = Atom.family(({ req }: FixReferenceKey) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return viewMutation(referencesToFix(req), {
    name: "fixReference",
    predict: (references, input: FixReferenceInput) =>
      withoutFixed(references, input),
    call: (client, input) =>
      client.projectReferences
        .fix({ params: req.params, payload: input })
        .pipe(
          Effect.tapError(() =>
            Reactivity.invalidate([
              Keys.ticketUpdatedQuery(scope),
              Keys.ticketsIn(scope)
            ])
          )
        ),
    confirm: replaceWith,
    publish: () => [Keys.ticketUpdatedQuery(scope), Keys.ticketsIn(scope)]
  }).pipe(Atom.setIdleTTL("1 minute"))
})
