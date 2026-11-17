import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import type { SprintRequest } from "@/features/sprints/atoms/sprintDetail"

import { LocalClient } from "../lib/localClient"
import { localReady, localRuntime } from "./localProject"

export const localSprintDetail = Atom.family((req: SprintRequest) =>
  localRuntime.atom((get) => {
    const project = { orgSlug: req.params.orgSlug, slug: req.params.slug }
    const ready = get(localReady(project))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.GroupDetail({ project, id: req.params.id })
      )
    )
  })
)
