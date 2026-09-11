import * as Atom from "effect/unstable/reactivity/Atom"
import type { GroupId } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

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
