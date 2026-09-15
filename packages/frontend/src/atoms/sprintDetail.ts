import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type { GroupId, UpdateGroupInput } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { applySprintDetailPatch } from "./sprintPatch"

export interface SprintRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: GroupId
  }
}

export const sprintRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): SprintRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: SprintRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const sprintQuery = (req: SprintRequest) =>
  Api.query("groups", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.sprint(scopeOf(req), req.params.id)]
  })

export const sprintDetail = Atom.family((req: SprintRequest) =>
  Atom.optimistic(sprintQuery(req))
)

export const updateSprintDetail = Atom.family((req: SprintRequest) =>
  Atom.optimisticFn(sprintDetail(req), {
    reducer: (current, patch: UpdateGroupInput) =>
      AsyncResult.map(current, (sprint) =>
        applySprintDetailPatch(sprint, patch)
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (patch: UpdateGroupInput) {
          const updated = yield* Api.use((client) =>
            client.groups.update({ params: req.params, payload: patch })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([Keys.sprints(scopeOf(req))])
          return updated
        })
      )
  })
)
