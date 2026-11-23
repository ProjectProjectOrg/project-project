import {
  TICKET_CONTENT_BATCH_LIMIT,
  TicketContent,
  TicketContentKinds,
  TicketContentLine,
  type TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { preloadKey, preloadQuery } from "@/api/query"
import { fireMutation } from "@/api/viewMutation"
import {
  commentsQuery,
  commentsRequest
} from "@/features/comments/atoms/comments"
import {
  subscribersQuery,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"

import { rememberPreloaded, ticketContentKey } from "../lib/ticketContent"
import { childTicketsPage, childTicketsRequest } from "./childTickets"
import {
  ticketActivityFirstPage,
  ticketActivityRequest
} from "./ticketActivity"
import { ticketQuery, ticketRequest } from "./ticketDetail"

export const PRELOADED_TICKET_LIMIT = 300
export const FILL_AHEAD = 30

type ProjectParams = Readonly<{ orgSlug: string; slug: string }>

type FillRequest = Readonly<{
  params: ProjectParams
  ids: ReadonlyArray<TicketId>
}>

type Preloaded = Readonly<{
  params: ProjectParams
  id: TicketId
  keys: ReadonlyArray<string>
}>

type FillState = Readonly<{
  preloaded: Map<string, Preloaded>
  pending: Set<string>
  kept: Map<string, Readonly<{ params: ProjectParams; ids: Set<TicketId> }>>
}>

const states = new WeakMap<AtomRegistry.AtomRegistry, FillState>()

const stateOf = (registry: AtomRegistry.AtomRegistry) => {
  const known = states.get(registry)
  if (known !== undefined) return known
  const state: FillState = {
    preloaded: new Map(),
    pending: new Set(),
    kept: new Map()
  }
  states.set(registry, state)
  return state
}

const keptIn = (registry: AtomRegistry.AtomRegistry, params: ProjectParams) => {
  const { kept } = stateOf(registry)
  const scope = projectScope(params.orgSlug, params.slug)
  const known = kept.get(scope)
  if (known !== undefined) return known.ids
  const ids = new Set<TicketId>()
  kept.set(scope, { params, ids })
  return ids
}

const preloadContent = (
  registry: AtomRegistry.AtomRegistry,
  { orgSlug, slug }: ProjectParams,
  id: TicketId,
  content: TicketContent
) =>
  TicketContent.match(content, {
    Detail: ({ value }) =>
      preloadQuery(
        registry,
        ticketQuery(ticketRequest(orgSlug, slug, id)),
        value
      ),
    Comments: ({ value }) =>
      preloadQuery(
        registry,
        commentsQuery(commentsRequest(orgSlug, slug, id)),
        value
      ),
    Activity: ({ value }) =>
      preloadQuery(
        registry,
        ticketActivityFirstPage(ticketActivityRequest(orgSlug, slug, id)),
        value
      ),
    Subscribers: ({ value }) =>
      preloadQuery(
        registry,
        subscribersQuery(ticketSubscribersRequest(orgSlug, slug, id)),
        value
      ),
    Children: ({ value }) =>
      preloadQuery(
        registry,
        childTicketsPage(childTicketsRequest(orgSlug, slug, id), undefined),
        value
      )
  })

const preloadWatch = Atom.family((params: ProjectParams) => {
  const scope = projectScope(params.orgSlug, params.slug)
  return Api.runtime
    .atom(
      Effect.gen(function* () {
        const registry = yield* AtomRegistry.AtomRegistry
        const reactivity = yield* Reactivity.Reactivity
        const unregister = reactivity.registerUnsafe(
          [
            Keys.ticketsIn(scope),
            Keys.ticketComments(scope),
            Keys.orgLibrary(params.orgSlug),
            Keys.projectLibrary(scope)
          ],
          () => refreshPreloaded(registry, params)
        )
        yield* Effect.addFinalizer(() => Effect.sync(unregister))
      })
    )
    .pipe(Atom.keepAlive)
})

const contentFill = Atom.family((req: FillRequest) =>
  Api.runtime.fn(
    Effect.fnUntraced(function* (_: void, get: Atom.FnContext) {
      const lines = yield* Api.use((client) =>
        client.tickets.content({
          params: req.params,
          payload: { ids: req.ids, kinds: TicketContentKinds }
        })
      )
      get.registry.get(preloadWatch(req.params))
      const { preloaded } = stateOf(get.registry)
      const loaded = new Map<TicketId, Array<string>>()
      for (const line of lines) {
        if (!TicketContentLine.guards.Found(line)) continue
        const key = preloadContent(
          get.registry,
          req.params,
          line.id,
          line.content
        )
        if (key === null) continue
        const keys = loaded.get(line.id) ?? []
        keys.push(key)
        loaded.set(line.id, keys)
      }
      for (const [id, keys] of loaded) {
        const evicted = rememberPreloaded(
          preloaded,
          ticketContentKey({ ...req.params, id }),
          { params: req.params, id, keys },
          PRELOADED_TICKET_LIMIT
        )
        for (const stale of evicted.flatMap((entry) => entry.keys))
          get.registry.preloadedSerializable.delete(stale)
      }
      for (const id of req.ids) {
        if (loaded.has(id)) continue
        const key = ticketContentKey({ ...req.params, id })
        for (const stale of preloaded.get(key)?.keys ?? [])
          get.registry.preloadedSerializable.delete(stale)
        preloaded.delete(key)
      }
    })
  )
)

const inMemory = (
  registry: AtomRegistry.AtomRegistry,
  { orgSlug, slug }: ProjectParams,
  id: TicketId
) =>
  [
    preloadKey(ticketQuery(ticketRequest(orgSlug, slug, id))),
    preloadKey(commentsQuery(commentsRequest(orgSlug, slug, id)))
  ].every(
    (key) =>
      key !== null &&
      (registry.getNodes().has(key) || registry.preloadedSerializable.has(key))
  )

const requestFill = (
  registry: AtomRegistry.AtomRegistry,
  params: ProjectParams,
  ids: ReadonlyArray<TicketId>
) => {
  const { pending } = stateOf(registry)
  const wanted = ids.filter(
    (id) => !pending.has(ticketContentKey({ ...params, id }))
  )
  for (
    let start = 0;
    start < wanted.length;
    start += TICKET_CONTENT_BATCH_LIMIT
  ) {
    const batch = wanted.slice(start, start + TICKET_CONTENT_BATCH_LIMIT)
    const keys = batch.map((id) => ticketContentKey({ ...params, id }))
    for (const key of keys) pending.add(key)
    void fireMutation(
      registry,
      contentFill({ params, ids: batch }),
      undefined
    ).finally(() => {
      for (const key of keys) pending.delete(key)
    })
  }
}

export const fillTicketContent = (
  registry: AtomRegistry.AtomRegistry,
  params: ProjectParams,
  ids: Iterable<TicketId>
) =>
  requestFill(
    registry,
    params,
    [...new Set(ids)].filter((id) => !inMemory(registry, params, id))
  )

const refreshPreloaded = (
  registry: AtomRegistry.AtomRegistry,
  params: ProjectParams
) => {
  const { preloaded } = stateOf(registry)
  const kept = keptIn(registry, params)
  const stale: Array<TicketId> = []
  for (const [key, entry] of preloaded) {
    if (entry.params.orgSlug !== params.orgSlug) continue
    if (entry.params.slug !== params.slug) continue
    const unread = entry.keys.filter((unreadKey) =>
      registry.preloadedSerializable.has(unreadKey)
    )
    if (unread.length > 0 && kept.has(entry.id)) {
      stale.push(entry.id)
      continue
    }
    preloaded.delete(key)
    for (const unreadKey of unread)
      registry.preloadedSerializable.delete(unreadKey)
  }
  requestFill(registry, params, stale)
}

export const fillTicketWindow = (
  registry: AtomRegistry.AtomRegistry,
  params: ProjectParams,
  near: ReadonlyArray<TicketId>,
  far: ReadonlyArray<TicketId>
) => {
  const { pending } = stateOf(registry)
  const covered = near.every(
    (id) =>
      pending.has(ticketContentKey({ ...params, id })) ||
      inMemory(registry, params, id)
  )
  if (!covered) fillTicketContent(registry, params, far)
  const kept = keptIn(registry, params)
  for (const id of far) kept.add(id)
  return () => {
    for (const id of far) kept.delete(id)
  }
}

const rowFills = new WeakMap<AtomRegistry.AtomRegistry, number>()

const fillKept = (registry: AtomRegistry.AtomRegistry) => {
  rowFills.delete(registry)
  for (const { params, ids } of stateOf(registry).kept.values())
    fillTicketContent(registry, params, ids)
}

export const showTicketRow = (
  registry: AtomRegistry.AtomRegistry,
  params: ProjectParams,
  id: TicketId
) => {
  const kept = keptIn(registry, params)
  kept.add(id)
  window.clearTimeout(rowFills.get(registry))
  rowFills.set(
    registry,
    window.setTimeout(() => fillKept(registry), 300)
  )
  return () => {
    kept.delete(id)
  }
}
