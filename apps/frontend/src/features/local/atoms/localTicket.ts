import type { LocalDescription, LocalTicket } from "@pp/local"
import type { TicketDetail } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import type { TicketRequest } from "@/features/tickets/atoms/ticketDetail"

import { LocalClient } from "../lib/localClient"
import {
  type LocalProjectRequest,
  localReady,
  localRuntime
} from "./localProject"
import { localViewContext } from "./localProjectFacts"
import { localValue, withDefects } from "./readLocal"

const projectOf = (req: TicketRequest): LocalProjectRequest => ({
  orgSlug: req.params.orgSlug,
  slug: req.params.slug
})

export const localTicket = Atom.family((req: TicketRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(projectOf(req)))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const context = get(localViewContext(projectOf(req)))
    if (context === undefined) return Stream.never
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.Ticket({
          project: projectOf(req),
          id: req.params.id,
          repositories: context.repositories
        })
      )
    )
  })
)

export const localDescription = Atom.family((req: TicketRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(projectOf(req)))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.Description({ project: projectOf(req), id: req.params.id })
      )
    )
  })
)

export const descriptionBody = (description: LocalDescription): string =>
  description.edit?.body ?? description.server.body

const toDetail = (
  local: LocalTicket,
  description: LocalDescription
): TicketDetail => ({
  ...local.ticket,
  parentState: local.parentState,
  relations: local.relations,
  creator: null,
  updater: null,
  body: descriptionBody(description),
  missingAttachments: description.missingAttachments
})

export const localTicketDetail = Atom.family((req: TicketRequest) =>
  Atom.make(
    (get): AsyncResult.AsyncResult<TicketDetail | null> =>
      AsyncResult.flatMap(
        withDefects(get(localTicket(req))),
        (fields, previous): AsyncResult.AsyncResult<TicketDetail | null> =>
          fields === null
            ? AsyncResult.success(null, previous)
            : AsyncResult.map(
                localValue(get(localDescription(req))),
                (description) => toDetail(fields, description)
              )
      )
  )
)

export const saveDescription = localRuntime.fn(
  Effect.fn("saveDescription")(function* (
    request: Parameters<LocalClient["Service"]["SaveDescription"]>[0]
  ) {
    const client = yield* LocalClient
    yield* client.SaveDescription(request)
  })
)

export const resolveDescription = localRuntime.fn(
  Effect.fn("resolveDescription")(function* (
    request: Parameters<LocalClient["Service"]["ResolveDescription"]>[0]
  ) {
    const client = yield* LocalClient
    yield* client.ResolveDescription(request)
  })
)
