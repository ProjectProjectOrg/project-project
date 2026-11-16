import type { EstimationMode, Ticket, TicketId, UserId } from "@pp/shared"
import { and, createLiveQueryCollection, eq, isNull } from "@tanstack/react-db"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { me } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"

import { decodeTicketRow } from "../lib/localProject"
import { type LocalScope, localProject } from "./localProject"

export type LocalViewer = Readonly<{
  viewerId: UserId | undefined
  estimation: EstimationMode
}>

export type LocalTicketFilter =
  | Readonly<{
      kind: "test"
      test: (ticket: Ticket, viewer: LocalViewer) => boolean
    }>
  | Readonly<{ kind: "children"; parent: TicketId }>

export const localTicketQuery = <A>(
  scope: LocalScope,
  options: Readonly<{
    where: LocalTicketFilter
    select: (
      matching: ReadonlyArray<Ticket>,
      all: () => ReadonlyArray<Ticket>
    ) => A
  }>
): Atom.Atom<AsyncResult.AsyncResult<A>> => {
  let resync = () => {}
  return Atom.readable(
    (get): AsyncResult.AsyncResult<A> => {
      const local = get(localProject(scope))
      const settings = get(project(projectRequest(scope.orgSlug, scope.slug)))
      if (!AsyncResult.isSuccess(local) || !AsyncResult.isSuccess(settings))
        return AsyncResult.initial(true)
      const me_ = get(me())
      const viewer: LocalViewer = {
        viewerId: AsyncResult.isSuccess(me_) ? me_.value.id : undefined,
        estimation: settings.value.estimation
      }
      const { rows, syncNow } = local.value
      resync = () => void syncNow()
      const matching = createLiveQueryCollection({
        startSync: true,
        query: (q) => {
          const all = q.from({ ticket: rows })
          const where = options.where
          return where.kind === "children"
            ? all.where(({ ticket }) =>
                and(
                  eq(ticket.parent?.id, where.parent),
                  isNull(ticket.archivedAt)
                )
              )
            : all.fn.where(({ ticket }) =>
                where.test(decodeTicketRow(ticket), viewer)
              )
        }
      })
      const compute = () =>
        AsyncResult.success(
          options.select([...matching.values()].map(decodeTicketRow), () =>
            [...rows.values()].map(decodeTicketRow)
          )
        )
      const subscription = matching.subscribeChanges(() =>
        get.setSelf(compute())
      )
      const stopReady = matching.onFirstReady(() => get.setSelf(compute()))
      get.addFinalizer(() => {
        stopReady()
        subscription.unsubscribe()
        void matching.cleanup()
      })
      return matching.isReady() ? compute() : AsyncResult.initial(true)
    },
    () => resync()
  )
}
