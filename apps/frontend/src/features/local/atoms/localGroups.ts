import type { Group } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { decodeGroupRow } from "../lib/localProject"
import { type LocalScope, localProject } from "./localProject"

export const localGroups = Atom.family((scope: LocalScope) => {
  let resync = () => {}
  return Atom.readable(
    (get): AsyncResult.AsyncResult<ReadonlyArray<Group>> => {
      const local = get(localProject(scope))
      if (!AsyncResult.isSuccess(local)) return AsyncResult.initial(true)
      const { groups, syncGroups } = local.value
      resync = () => void syncGroups()
      const read = () =>
        AsyncResult.success([...groups.values()].map(decodeGroupRow))
      const subscription = groups.subscribeChanges(() => get.setSelf(read()))
      const stopReady = groups.onFirstReady(() => get.setSelf(read()))
      get.addFinalizer(() => {
        stopReady()
        subscription.unsubscribe()
      })
      return groups.isReady() ? read() : AsyncResult.initial(true)
    },
    () => resync()
  )
})
