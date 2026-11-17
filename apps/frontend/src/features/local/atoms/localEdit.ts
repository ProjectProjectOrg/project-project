import {
  type PendingEdit,
  type PendingGroupEdit,
  PendingWrite
} from "@pp/local"
import * as Effect from "effect/Effect"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { projectScope } from "@/api/keys"
import { recordCreatedKey } from "@/features/tickets/atoms/createdKeys"

import { LocalClient } from "../lib/localClient"
import { localActive } from "./localActive"
import {
  type LocalProjectRequest,
  localReady,
  localRuntime
} from "./localProject"

export type LocalEdit = Readonly<{
  write: PendingWrite
  edits: ReadonlyArray<PendingEdit>
  groups?: ReadonlyArray<PendingGroupEdit>
}>

export const localEditing = Atom.family((project: LocalProjectRequest) =>
  Atom.make(
    (get) =>
      get(localActive(projectScope(project.orgSlug, project.slug))) &&
      get(localReady(project)) === true
  )
)

export const localEditFn = <I>(
  project: LocalProjectRequest,
  toLocal: (input: I) => ReadonlyArray<LocalEdit>
) =>
  localRuntime.fn(
    Effect.fn("localEdit")(function* (input: I, get: Atom.FnContext) {
      const client = yield* LocalClient
      yield* Effect.forEach(
        toLocal(input),
        (edit) =>
          Effect.tap(client.Edit({ project, ...edit }), (created) =>
            Effect.sync(() => {
              if (created !== null && PendingWrite.guards.create(edit.write))
                recordCreatedKey(
                  get,
                  projectScope(project.orgSlug, project.slug),
                  created,
                  edit.write.placeholder
                )
            })
          ),
        { concurrency: "unbounded", discard: true }
      )
    }, Effect.uninterruptible)
  )

export const localFirst = <I, A, E>(
  project: LocalProjectRequest,
  server: Atom.Writable<
    AsyncResult.AsyncResult<A, E>,
    I | Atom.Reset | Atom.Interrupt
  >,
  toLocal: (input: I) => ReadonlyArray<LocalEdit>
) => {
  const local = localEditFn(project, toLocal)
  return Atom.writable(
    (get): AsyncResult.AsyncResult<A | void, E | Atom.Failure<typeof local>> =>
      get(localEditing(project)) ? get(local) : get(server),
    (ctx, input: I | Atom.Reset | Atom.Interrupt) => {
      if (ctx.get(localEditing(project))) ctx.set(local, input)
      else ctx.set(server, input)
    }
  )
}
