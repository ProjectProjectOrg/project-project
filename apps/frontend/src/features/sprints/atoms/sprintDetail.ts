import {
  GroupDetail,
  type GroupId,
  NotFound,
  type UpdateGroupInput
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { persisted } from "@/api/bootCache"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"
import { localSprintDetail } from "@/features/local/atoms/localSprint"
import { localGroups } from "@/features/local/atoms/localViews"
import { localValue, withDefects } from "@/features/local/atoms/readLocal"

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

const sprintSource = (req: SprintRequest) =>
  Atom.make((get) =>
    AsyncResult.flatMap(
      withDefects(get(localSprintDetail(req))),
      (sprint, previous): AsyncResult.AsyncResult<GroupDetail, NotFound> => {
        if (sprint !== null) return AsyncResult.success(sprint, previous)
        const groups = localValue(
          get(
            localGroups({ orgSlug: req.params.orgSlug, slug: req.params.slug })
          )
        )
        return AsyncResult.isSuccess(groups) &&
          !groups.value.some((group) => group.id === req.params.id)
          ? AsyncResult.fail(new NotFound())
          : AsyncResult.initial(true)
      }
    )
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
