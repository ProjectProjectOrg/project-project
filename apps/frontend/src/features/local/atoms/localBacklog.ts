import { SectionsView } from "@pp/local"
import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { projectScope } from "@/api/keys"
import { currentUserId } from "@/features/auth/atoms/auth"
import type {
  BacklogRequest,
  BacklogValue
} from "@/features/tickets/atoms/backlog"
import { backlogLoadedPages } from "@/features/tickets/atoms/backlogPages"
import { createdKeys } from "@/features/tickets/atoms/createdKeys"
import type { CountsRequest } from "@/features/tickets/atoms/ticketCounts"
import { toRow, withCreatedKeys } from "@/features/tickets/lib/ticketRows"

import { rememberLocalView } from "../lib/localBoot"
import { LocalClient } from "../lib/localClient"
import { localReady, localRuntime } from "./localProject"
import { localViewContext } from "./localProjectFacts"

export const localBacklog = Atom.family((req: BacklogRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const context = get(localViewContext(req.params))
    if (context === undefined) return Stream.never
    const loaded = get(backlogLoadedPages(req))
    const scope = projectScope(req.params.orgSlug, req.params.slug)
    const created = get(createdKeys(scope))
    const request = {
      project: req.params,
      query: req.query,
      viewerId: get(currentUserId),
      estimation: context.estimation,
      repositories: context.repositories,
      pages: loaded,
      pageSize: TICKET_LIST_LIMIT
    }
    rememberLocalView(SectionsView.make({ request }))
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.Sections(request).pipe(
          Stream.map((value): BacklogValue | null =>
            value === null
              ? null
              : {
                  counts: value.counts,
                  sections: Object.fromEntries(
                    Object.entries(value.sections).map(([key, page]) => [
                      key,
                      {
                        items: withCreatedKeys(page.items.map(toRow), created),
                        nextCursor: page.nextCursor
                      }
                    ])
                  )
                }
          )
        )
      )
    )
  })
)

export const localCounts = Atom.family((req: CountsRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const context = get(localViewContext(req.params))
    if (context === undefined) return Stream.never
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.Counts({
          project: req.params,
          query: req.query,
          viewerId: get(currentUserId),
          estimation: context.estimation
        })
      )
    )
  })
)
