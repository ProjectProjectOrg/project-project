import type { ProjectDetail, TicketListQuery } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { currentUserId } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import type { BoardRequest } from "@/features/sprints/atoms/sprintBoard"
import type { TicketSequenceRequest } from "@/features/tickets/atoms/ticketSequence"

import { LocalClient } from "../lib/localClient"
import { repositories } from "./localBacklog"
import {
  type LocalProjectRequest,
  localReady,
  localRuntime
} from "./localProject"

type Gate =
  | Readonly<{ kind: "waiting" }>
  | Readonly<{ kind: "server" }>
  | Readonly<{ kind: "local"; detail: ProjectDetail }>

const gate = (
  get: Atom.AtomContext,
  { orgSlug, slug }: LocalProjectRequest
): Gate => {
  const ready = get(localReady({ orgSlug, slug }))
  if (ready === undefined) return { kind: "waiting" }
  if (!ready) return { kind: "server" }
  const detail = get(project(projectRequest(orgSlug, slug)))
  return AsyncResult.isSuccess(detail)
    ? { kind: "local", detail: detail.value }
    : { kind: "waiting" }
}

const localStream = <A, E>(
  get: Atom.AtomContext,
  params: LocalProjectRequest,
  open: (
    client: LocalClient["Service"],
    detail: ProjectDetail
  ) => Stream.Stream<A | null, E>
) => {
  const state = gate(get, params)
  if (state.kind === "waiting") return Stream.never
  if (state.kind === "server") return Stream.make(null)
  return Stream.unwrap(
    Effect.map(LocalClient, (client) => open(client, state.detail))
  )
}

export type LocalTicketListRequest = Readonly<{
  params: LocalProjectRequest
  query: TicketListQuery
}>

export const localTicketList = Atom.family((req: LocalTicketListRequest) =>
  localRuntime.atom((get) =>
    localStream(get, req.params, (client, detail) =>
      client.TicketList({
        project: req.params,
        query: req.query,
        viewerId: get(currentUserId),
        estimation: detail.estimation,
        repositories: repositories(detail)
      })
    )
  )
)

export const localSprintBoard = Atom.family((req: BoardRequest) =>
  localRuntime.atom((get) => {
    const { orgSlug, slug, id } = req.params
    return localStream(get, { orgSlug, slug }, (client, detail) =>
      client.SprintBoard({
        project: { orgSlug, slug },
        groupId: id,
        repositories: repositories(detail)
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
          estimation: state.detail.estimation
        })
      )
    })
    .pipe(Atom.setIdleTTL("2 minutes"))
)
