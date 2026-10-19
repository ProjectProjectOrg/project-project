import {
  deriveStatusSlug,
  pickStatusColor,
  type CreateStatusInput,
  type DeleteStatusInput,
  type ProjectStatus,
  type ReorderStatusInput,
  type StatusSlug,
  type UpdateStatusInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { compareByOrderKey } from "@/lib/orderKey"

export type StatusesRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const statusesRequest = (
  orgSlug: string,
  slug: string
): StatusesRequest => ({
  params: { orgSlug, slug }
})

const scopeOf = (req: StatusesRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const statusesQuery = (req: StatusesRequest) =>
  Api.query("statuses", "list", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.statuses(scopeOf(req))]
  })

export const statusesFor = Atom.family((req: StatusesRequest) =>
  Atom.optimistic(statusesQuery(req))
)

export const createStatus = Atom.family((req: StatusesRequest) =>
  Atom.optimisticFn(statusesFor(req), {
    reducer: (current, input: CreateStatusInput) =>
      AsyncResult.map(current, (statuses) => {
        const derivedSlug = deriveStatusSlug(input.label)
        if (derivedSlug.length === 0) return statuses
        if (statuses.some((status) => status.slug === derivedSlug)) {
          return statuses
        }
        const synthetic: ProjectStatus = {
          slug: derivedSlug as ProjectStatus["slug"],
          label: input.label,
          icon: input.icon ?? "Circle",
          color:
            input.color ??
            (pickStatusColor(
              statuses.map((status) => status.color)
            ) as ProjectStatus["color"]),
          orderKey: "zzz" as ProjectStatus["orderKey"],
          createdBy: "",
          createdAt: DateTime.toDate(DateTime.nowUnsafe())
        }
        return [...statuses, synthetic]
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("createStatus")(function* (input: CreateStatusInput, get) {
          const created = yield* Api.use((client) =>
            client.statuses.create({ params: req.params, payload: input })
          )
          const derivedSlug = deriveStatusSlug(input.label)
          set(
            AsyncResult.map(get(statusesFor(req)), (statuses) =>
              statuses.map((status) =>
                status.slug === derivedSlug ? created : status
              )
            )
          )
          return created
        })
      )
  })
)

export const updateStatus = Atom.family(
  ({
    req,
    statusSlug
  }: Readonly<{
    req: StatusesRequest
    statusSlug: StatusSlug
  }>) =>
    Atom.optimisticFn(statusesFor(req), {
      reducer: (current, patch: UpdateStatusInput) =>
        AsyncResult.map(current, (statuses) =>
          statuses.map((status) =>
            status.slug === statusSlug
              ? {
                  ...status,
                  label: patch.label ?? status.label,
                  icon: patch.icon ?? status.icon,
                  color: patch.color ?? status.color
                }
              : status
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateStatus")(function* (patch: UpdateStatusInput, get) {
            const updated = yield* Api.use((client) =>
              client.statuses.update({
                params: { ...req.params, statusSlug },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(statusesFor(req)), (statuses) =>
                statuses.map((status) =>
                  status.slug === statusSlug ? updated : status
                )
              )
            )
            if (patch.label !== undefined) {
              yield* Reactivity.invalidate([
                Keys.ticketsIn(scopeOf(req)),
                Keys.ticketLists(scopeOf(req)),
                Keys.ticketPages(scopeOf(req))
              ])
            }
            return updated
          })
        )
    })
)

export const reorderStatus = Atom.family(
  ({
    req,
    statusSlug
  }: Readonly<{
    req: StatusesRequest
    statusSlug: StatusSlug
  }>) =>
    Atom.optimisticFn(statusesFor(req), {
      reducer: (current, input: ReorderStatusInput) =>
        AsyncResult.map(current, (statuses) =>
          statuses
            .map((status) =>
              status.slug === statusSlug
                ? { ...status, orderKey: input.orderKey }
                : status
            )
            .toSorted(compareByOrderKey)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("reorderStatus")(function* (
            input: ReorderStatusInput,
            get
          ) {
            const reordered = yield* Api.use((client) =>
              client.statuses.reorder({
                params: { ...req.params, statusSlug },
                payload: input
              })
            )
            set(
              AsyncResult.map(get(statusesFor(req)), (statuses) =>
                statuses
                  .map((status) =>
                    status.slug === statusSlug ? reordered : status
                  )
                  .toSorted(compareByOrderKey)
              )
            )
            return reordered
          })
        )
    })
)

export type StatusReorder = Readonly<{
  statusSlug: StatusSlug
  orderKey: ReorderStatusInput["orderKey"]
}>

export const dispatchStatusReorders = Atom.family((req: StatusesRequest) =>
  Atom.fnSync((reorders: ReadonlyArray<StatusReorder>, get) => {
    for (const { statusSlug, orderKey } of reorders) {
      const mutation = reorderStatus({ req, statusSlug })
      const unmount = get.registry.mount(mutation)
      get.set(mutation, { orderKey })
      void Effect.runPromiseExit(
        Registry.getResult(get.registry, mutation, { suspendOnWaiting: true })
      ).finally(unmount)
    }
  })
)

export const deleteStatus = Atom.family(
  ({
    req,
    statusSlug
  }: Readonly<{
    req: StatusesRequest
    statusSlug: StatusSlug
  }>) =>
    Atom.optimisticFn(statusesFor(req), {
      reducer: (current, _input: DeleteStatusInput) =>
        AsyncResult.map(current, (statuses) =>
          statuses.filter((status) => status.slug !== statusSlug)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("deleteStatus")(function* (input: DeleteStatusInput, get) {
            yield* Api.use((client) =>
              client.statuses.remove({
                params: { ...req.params, statusSlug },
                query: input
              })
            )
            set(
              AsyncResult.map(get(statusesFor(req)), (statuses) =>
                statuses.filter((status) => status.slug !== statusSlug)
              )
            )
            yield* Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
          })
        )
    })
)
