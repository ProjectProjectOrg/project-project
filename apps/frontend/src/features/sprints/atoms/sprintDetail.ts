import type { GroupId, UpdateGroupInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"

import { applySprintDetailPatch } from "./sprintPatch"

export type SprintRequest = ReturnType<typeof sprintRequest>

export const sprintRequest = (orgSlug: string, slug: string, id: GroupId) =>
  ({
    _view: "sprintDetail",
    params: { orgSlug, slug, id }
  }) as const

const scopeOf = (req: SprintRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const sprintQuery = (req: SprintRequest) =>
  query("groups", "get", {
    params: req.params,
    reactivityKeys: [
      Keys.sprint(scopeOf(req), req.params.id),
      Keys.projectResync(scopeOf(req))
    ]
  })

export const sprintDetail = Atom.family((req: SprintRequest) =>
  Atom.optimistic(sprintQuery(req))
)

export const updateSprintDetail = Atom.family((req: SprintRequest) =>
  viewMutation(sprintDetail(req), {
    name: "updateSprintDetail",
    predict: (sprint, patch: UpdateGroupInput) =>
      applySprintDetailPatch(sprint, patch),
    call: (client, patch) =>
      client.groups.update({ params: req.params, payload: patch }),
    confirm: replaceWith,
    publish: () => [Keys.sprints(scopeOf(req)), Keys.pins(req.params.orgSlug)]
  })
)
