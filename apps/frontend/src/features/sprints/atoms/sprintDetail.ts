import type { GroupId, UpdateGroupInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

import { applySprintDetailPatch } from "./sprintPatch"

export type SprintRequest = Readonly<{
  _view: "sprintDetail"
  params: Readonly<{
    orgSlug: string
    slug: string
    id: GroupId
  }>
}>

export const sprintRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): SprintRequest => ({ _view: "sprintDetail", params: { orgSlug, slug, id } })

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
  viewMutation(sprintDetail(req), {
    name: "updateSprintDetail",
    predict: (sprint, patch: UpdateGroupInput) =>
      applySprintDetailPatch(sprint, patch),
    call: (patch) =>
      Api.use((client) =>
        client.groups.update({ params: req.params, payload: patch })
      ),
    confirm: replaceWith,
    publish: () => [Keys.sprints(scopeOf(req))]
  })
)
