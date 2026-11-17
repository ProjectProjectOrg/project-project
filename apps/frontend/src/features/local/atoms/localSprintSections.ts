import { SprintSectionsView } from "@pp/local"
import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { currentUserId } from "@/features/auth/atoms/auth"
import { sprintLoadedPages } from "@/features/tickets/atoms/sprintPages"
import type { SprintSectionsRequest } from "@/features/tickets/atoms/sprintSections"

import { rememberLocalView } from "../lib/localBoot"
import { LocalClient } from "../lib/localClient"
import { localReady, localRuntime } from "./localProject"
import { localViewContext } from "./localProjectFacts"

export const localSprintSections = Atom.family((req: SprintSectionsRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const context = get(localViewContext(req.params))
    if (context === undefined) return Stream.never
    const loaded = get(sprintLoadedPages(req))
    const request = {
      project: req.params,
      query: req.query,
      viewerId: get(currentUserId),
      estimation: context.estimation,
      repositories: context.repositories,
      pages: loaded,
      pageSize: TICKET_LIST_LIMIT
    }
    rememberLocalView(SprintSectionsView.make({ request }))
    return Stream.unwrap(
      Effect.map(LocalClient, (client) => client.SprintSections(request))
    )
  })
)
