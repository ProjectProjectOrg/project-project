import { Atom, Result } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  type CreateTicketInput,
  type DeleteTicketInput,
  type TicketChanged,
  type TicketDetail,
  type TicketId,
  type UpdateTicketInput
} from "@projectproject/shared"

export type TicketConflict = {
  readonly error: TicketChanged
  readonly remote: TicketDetail
}

export type UpdateTicketResult =
  | { readonly _tag: "Ok"; readonly ticket: TicketDetail }
  | { readonly _tag: "Conflict"; readonly conflict: TicketConflict }

export type DeleteTicketResult =
  | { readonly _tag: "Ok" }
  | { readonly _tag: "Conflict"; readonly conflict: TicketConflict }

// Family keys are primitive strings. Slugs and ticket ids are URL-safe
// (no `/`), so a slash is an unambiguous separator.

export const ticketsListKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

const splitListKey = (key: string): { orgSlug: string; slug: string } => {
  const idx = key.indexOf("/")
  return { orgSlug: key.slice(0, idx), slug: key.slice(idx + 1) }
}

const ticketsListBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitListKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.list({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const ticketsListAtom = Atom.family((key: string) =>
  Atom.optimistic(ticketsListBaseAtom(key))
)

export const ticketKey = (orgSlug: string, slug: string, id: TicketId) =>
  `${orgSlug}/${slug}/${id}`

const splitTicketKey = (
  key: string
): { orgSlug: string; slug: string; id: TicketId } => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    id: parts.slice(2).join("/") as TicketId
  }
}

const ticketBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.get({ path: { orgSlug, slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const ticketAtom = Atom.family((key: string) =>
  Atom.optimistic(ticketBaseAtom(key))
)

export const createTicketAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string } & CreateTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, ...payload } = input
    const ticket = yield* client.tickets.create({
      path: { orgSlug, slug },
      payload
    })
    get.refresh(ticketsListBaseAtom(ticketsListKey(orgSlug, slug)))
    return ticket
  })
)

export const updateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  const listKey = ticketsListKey(orgSlug, slug)
  return Atom.optimisticFn(ticketAtom(key), {
    reducer: (current, input: UpdateTicketInput) => {
      if (!Result.isSuccess(current)) return current
      const next: TicketDetail = {
        ...current.value,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.priority !== undefined
          ? { priority: input.priority }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.assignees !== undefined
          ? { assignees: input.assignees }
          : {}),
        ...(input.body !== undefined ? { body: input.body } : {})
      }
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: UpdateTicketInput, get) {
        const client = yield* ApiClient
        return yield* client.tickets
          .update({ path: { orgSlug, slug, id }, payload: input })
          .pipe(
            Effect.map(
              (ticket): UpdateTicketResult => ({ _tag: "Ok", ticket })
            ),
            Effect.catchTag("TicketChanged", (error) =>
              Effect.gen(function* () {
                const remote = yield* client.tickets.get({
                  path: { orgSlug, slug, id }
                })
                get.refresh(ticketBaseAtom(key))
                get.refresh(ticketsListBaseAtom(listKey))
                return {
                  _tag: "Conflict",
                  conflict: { error, remote }
                } satisfies UpdateTicketResult
              })
            ),
            Effect.tap((result) =>
              result._tag === "Ok"
                ? Effect.sync(() => {
                    get.refresh(ticketBaseAtom(key))
                    get.refresh(ticketsListBaseAtom(listKey))
                  })
                : Effect.void
            )
          )
      })
    )
  })
})

export const deleteTicketAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string; id: TicketId } & DeleteTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, id, baseVersion } = input
    return yield* client.tickets
      .delete({
        path: { orgSlug, slug, id },
        payload: { baseVersion }
      })
      .pipe(
        Effect.map((): DeleteTicketResult => ({ _tag: "Ok" })),
        Effect.catchTag("TicketChanged", (error) =>
          Effect.gen(function* () {
            const remote = yield* client.tickets.get({
              path: { orgSlug, slug, id }
            })
            get.refresh(ticketBaseAtom(ticketKey(orgSlug, slug, id)))
            get.refresh(ticketsListBaseAtom(ticketsListKey(orgSlug, slug)))
            return {
              _tag: "Conflict",
              conflict: { error, remote }
            } satisfies DeleteTicketResult
          })
        ),
        Effect.tap((result) =>
          result._tag === "Ok"
            ? Effect.sync(() =>
                get.refresh(ticketsListBaseAtom(ticketsListKey(orgSlug, slug)))
              )
            : Effect.void
        )
      )
  })
)
