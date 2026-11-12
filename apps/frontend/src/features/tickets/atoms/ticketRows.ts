import type {
  BulkUpdateTicketsInput,
  TicketId,
  TicketSort,
  TicketUpdateResult
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import {
  coalescingMutation,
  keepPredicted,
  viewMutation,
  type OptimisticView
} from "@/api/viewMutation"
import {
  fromBulkPatch,
  mergeTicketEdit,
  type TicketEdit,
  toUpdateInput
} from "@/features/tickets/lib/ticketPatch"

import { bulkBatches, bulkChangedKeys } from "./bulkTickets"

export type TicketUpdateAtom = Atom.AtomResultFn<TicketEdit, unknown, unknown>

export type TicketUpdates = (id: TicketId) => TicketUpdateAtom

export type BulkTicketUpdateAtom = Atom.AtomResultFn<
  BulkUpdateTicketsInput,
  unknown,
  unknown
>

type BulkTicketUpdate<V> = Readonly<{
  name: string
  path: Readonly<{ orgSlug: string; slug: string }>
  predict: (value: V, id: TicketId, edit: TicketEdit) => V
}>

export const bulkTicketUpdate = <V, VE>(
  view: OptimisticView<V, VE>,
  update: BulkTicketUpdate<V>
) =>
  viewMutation(view, {
    name: update.name,
    predict: (value, input: BulkUpdateTicketsInput) => {
      const edit = fromBulkPatch(input.patch)
      return input.tickets.reduce(
        (current, id) => update.predict(current, id, edit),
        value
      )
    },
    call: (client, input) =>
      Effect.forEach(bulkBatches(input.tickets), (tickets) =>
        client.tickets.bulkUpdate({
          params: update.path,
          payload: { tickets, patch: input.patch }
        })
      ).pipe(
        Effect.onError(() =>
          Reactivity.invalidate(
            bulkChangedKeys(
              update.path,
              input.tickets,
              input.patch.sprint !== undefined
            )
          )
        )
      ),
    confirm: keepPredicted,
    publish: (_result, input) =>
      bulkChangedKeys(
        update.path,
        input.tickets,
        input.patch.sprint !== undefined
      )
  })

export const createdKeys = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

export const recordCreatedKey = (
  get: Atom.FnContext,
  scope: string,
  id: TicketId,
  clientId: string
) => {
  const index = createdKeys(scope)
  get.set(index, new Map(get(index)).set(id, clientId))
}

type Page<Item> = Readonly<{
  items: ReadonlyArray<Item>
  nextCursor: string | null
}>

export type LoadedPages<Item> = Readonly<{
  items: ReadonlyArray<Item>
  nextCursor: string | null
  waiting: boolean
}>

export const readLoadedPages = <Item, E>(
  get: Atom.AtomContext,
  first: Page<Item>,
  depth: number,
  page: (cursor: string) => Atom.Atom<AsyncResult.AsyncResult<Page<Item>, E>>
): LoadedPages<Item> => {
  const items: Array<Item> = [...first.items]
  let nextCursor = first.nextCursor
  let waiting = false
  for (let index = 0; index < depth; index++) {
    if (nextCursor === null) break
    const result = get(page(nextCursor))
    waiting = waiting || result.waiting
    if (!AsyncResult.isSuccess(result)) break
    items.push(...result.value.items)
    nextCursor = result.value.nextCursor
  }
  return { items, nextCursor, waiting }
}

export type NextPage<P extends Page<unknown>, E> = Readonly<{
  visibleCursor: () => string | null | undefined
  depth: () => number
  firstCursor: () => string | null | undefined
  page: (cursor: string) => Atom.Atom<AsyncResult.AsyncResult<P, E>>
  deepen: (depth: number) => void
}>

const settledPage = <P, E>(
  get: Atom.FnContext,
  page: Atom.Atom<AsyncResult.AsyncResult<P, E>>
) =>
  Effect.callback<P, E>((resume) => {
    let cancel: (() => void) | undefined
    cancel = get.registry.subscribe(
      page,
      (result) => {
        if (AsyncResult.isSuccess(result) && !result.waiting) {
          cancel?.()
          resume(Effect.succeed(result.value))
        } else if (AsyncResult.isFailure(result) && !result.waiting) {
          cancel?.()
          resume(Effect.failCause(result.cause))
        }
      },
      { immediate: false }
    )
    get.refresh(page)
    return Effect.sync(() => cancel?.())
  })

export const loadNextPage = <P extends Page<unknown>, E>(
  get: Atom.FnContext,
  pages: NextPage<P, E>
): Effect.Effect<P | void, E> => {
  const cursor = pages.visibleCursor()
  if (!cursor) return Effect.void
  const depth = pages.depth()
  let pageCursor = pages.firstCursor()
  if (pageCursor === undefined) return Effect.void
  for (let index = 0; index < depth; index++) {
    if (pageCursor === null) break
    const page = pages.page(pageCursor)
    if (pageCursor === cursor) return settledPage(get, page)
    const result = get(page)
    if (!AsyncResult.isSuccess(result)) return Effect.void
    pageCursor = result.value.nextCursor
  }
  pages.deepen(depth + 1)
  return get.result(pages.page(cursor), { suspendOnWaiting: true })
}

export type TicketPath = Readonly<{
  orgSlug: string
  slug: string
  id: TicketId
}>

export type CoalescingTicketUpdate<V> = Readonly<{
  name: string
  path: TicketPath
  sort?: TicketSort
  idleTTL?: "2 minutes" | "10 minutes"
  predict: (value: V, patch: TicketEdit) => V
  confirm: (value: V, confirmed: TicketUpdateResult) => V
  publish?: (patch: TicketEdit) => ReadonlyArray<ReactivityKey>
}>

export const coalescingTicketUpdate = <V, VE>(
  view: OptimisticView<V, VE>,
  update: CoalescingTicketUpdate<V>
) =>
  coalescingMutation(view, {
    name: update.name,
    idleTTL: update.idleTTL ?? "2 minutes",
    predict: update.predict,
    merge: mergeTicketEdit,
    call: (client, edit: TicketEdit) =>
      client.tickets.update({
        params: update.path,
        query: update.sort === undefined ? {} : { sort: update.sort },
        payload: toUpdateInput(edit)
      }),
    confirm: (value, confirmed) => update.confirm(value, confirmed),
    publish: (_confirmed, payload) =>
      update.publish?.(payload) ??
      Keys.ticketChanged(
        projectScope(update.path.orgSlug, update.path.slug),
        update.path.id
      )
  })
