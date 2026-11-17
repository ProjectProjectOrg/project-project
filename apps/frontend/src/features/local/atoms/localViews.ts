import type { TicketListQuery } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { currentUserId } from "@/features/auth/atoms/auth"
import type { BoardRequest } from "@/features/sprints/atoms/sprintBoard"
import type { TicketSequenceRequest } from "@/features/tickets/atoms/ticketSequence"

import { LocalClient } from "../lib/localClient"
import {
  type LocalProjectRequest,
  localReady,
  localRuntime
} from "./localProject"
import { type LocalViewContext, localViewContext } from "./localProjectFacts"

type Gate =
  | Readonly<{ kind: "waiting" }>
  | Readonly<{ kind: "server" }>
  | Readonly<{ kind: "local"; context: LocalViewContext }>

const gate = (get: Atom.AtomContext, params: LocalProjectRequest): Gate => {
  const ready = get(localReady(params))
  if (ready === undefined) return { kind: "waiting" }
  if (!ready) return { kind: "server" }
  const context = get(localViewContext(params))
  return context === undefined
    ? { kind: "waiting" }
    : { kind: "local", context }
}

const localStream = <A, E>(
  get: Atom.AtomContext,
  params: LocalProjectRequest,
  open: (
    client: LocalClient["Service"],
    context: LocalViewContext
  ) => Stream.Stream<A | null, E>
) => {
  const state = gate(get, params)
  if (state.kind === "waiting") return Stream.never
  if (state.kind === "server") return Stream.make(null)
  return Stream.unwrap(
    Effect.map(LocalClient, (client) => open(client, state.context))
  )
}

export type LocalTicketListRequest = Readonly<{
  params: LocalProjectRequest
  query: TicketListQuery
}>

export const localTicketList = Atom.family((req: LocalTicketListRequest) =>
  localRuntime.atom((get) =>
    localStream(get, req.params, (client, context) =>
      client.TicketList({
        project: req.params,
        query: req.query,
        viewerId: get(currentUserId),
        estimation: context.estimation,
        repositories: context.repositories
      })
    )
  )
)

export const localSprintBoard = Atom.family((req: BoardRequest) =>
  localRuntime.atom((get) => {
    const { orgSlug, slug, id } = req.params
    return localStream(get, { orgSlug, slug }, (client, context) =>
      client.SprintBoard({
        project: { orgSlug, slug },
        groupId: id,
        repositories: context.repositories
      })
    )
  })
)

export const localGroups = Atom.family((params: LocalProjectRequest) =>
  localRuntime.atom((get) =>
    localStream(get, params, (client) => client.Groups(params))
  )
)

export const localTitles = Atom.family((params: LocalProjectRequest) =>
  localRuntime.atom((get) =>
    localStream(get, params, (client) => client.Titles(params))
  )
)

export const localSequence = Atom.family((req: TicketSequenceRequest) =>
  localRuntime
    .atom((get) => {
      const { orgSlug, slug, id } = req.params
      const state = gate(get, { orgSlug, slug })
      if (state.kind === "waiting") return Effect.never
      if (state.kind === "server") return Effect.succeed(null)
      return Effect.flatMap(LocalClient, (client) =>
        client.Sequence({
          project: { orgSlug, slug },
          id,
          from: req.from,
          viewerId: get(currentUserId),
          estimation: state.context.estimation
        })
      )
    })
    .pipe(Atom.setIdleTTL("2 minutes"))
)
