import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { currentUserId } from "@/features/auth/atoms/auth"
import { epicLoadedPages } from "@/features/tickets/atoms/epicPages"
import type { EpicSectionsRequest } from "@/features/tickets/atoms/epicSections"

import { LocalClient } from "../lib/localClient"
import { localReady, localRuntime } from "./localProject"
import { localViewContext } from "./localProjectFacts"

export const localParentSections = Atom.family((req: EpicSectionsRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const context = get(localViewContext(req.params))
    if (context === undefined) return Stream.never
    const loaded = get(epicLoadedPages(req))
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.ParentSections({
          project: req.params,
          by: req.by,
          query: req.query,
          viewerId: get(currentUserId),
          estimation: context.estimation,
          repositories: context.repositories,
          pages: loaded,
          pageSize: TICKET_LIST_LIMIT
        })
      )
    )
  })
)
