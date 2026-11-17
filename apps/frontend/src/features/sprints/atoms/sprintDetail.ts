import { GroupDetail, type GroupId, type UpdateGroupInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { persisted } from "@/api/bootCache"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"
import { localSprintDetail } from "@/features/local/atoms/localSprint"
import { readLocal } from "@/features/local/atoms/readLocal"

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
  query("groups", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.sprint(scopeOf(req), req.params.id)]
  })

const sprintSource = (req: SprintRequest) =>
  Atom.readable(
    (get) =>
      readLocal(get, req.params, () => localSprintDetail(req)) ??
      get(sprintQuery(req)),
    (refresh) => refresh(sprintQuery(req))
  )

export const sprintDetail = Atom.family((req: SprintRequest) =>
  Atom.optimistic(
    sprintSource(req).pipe(
      persisted(`sprint/${scopeOf(req)}/${req.params.id}`, GroupDetail)
    )
  )
)

export const updateSprintDetail = Atom.family((req: SprintRequest) =>
  viewMutation(sprintDetail(req), {
    name: "updateSprintDetail",
    predict: (sprint, patch: UpdateGroupInput) =>
      applySprintDetailPatch(sprint, patch),
    call: (client, patch) =>
      client.groups.update({ params: req.params, payload: patch }),
    confirm: replaceWith,
    publish: () => [Keys.sprints(scopeOf(req))]
  })
)
