import type { SyncChangeRef } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { SyncLog, type SyncPosition } from "./SyncLog"

export type RecordedSync = {
  appended: Array<
    Readonly<{ projectId: string; changes: ReadonlyArray<SyncChangeRef> }>
  >
  bumped: Array<string>
}

export const recordingSyncLog = () => {
  const recorded: RecordedSync = { appended: [], bumped: [] }
  const heads = new Map<string, SyncPosition>()
  const headOf = (projectId: string) =>
    heads.get(projectId) ?? { generation: 1, sequence: 0 }
  const layer = Layer.succeed(
    SyncLog,
    SyncLog.of({
      append: (projectId, changes) =>
        Effect.sync(() => {
          recorded.appended.push({ projectId, changes })
          const next = {
            ...headOf(projectId),
            sequence: headOf(projectId).sequence + 1
          }
          heads.set(projectId, next)
          return next
        }),
      bumpGeneration: (projectId) =>
        Effect.sync(() => {
          recorded.bumped.push(projectId)
          const next = {
            generation: headOf(projectId).generation + 1,
            sequence: 0
          }
          heads.set(projectId, next)
          return next
        }),
      head: (projectId) => Effect.sync(() => headOf(projectId)),
      entriesAfter: () => Effect.succeed([]),
      positionsOf: () => Effect.succeed(new Map()),
      withEntry: (projectId, changes, write) =>
        Effect.tap(write, () =>
          Effect.sync(() => {
            recorded.appended.push({ projectId, changes })
          })
        )
    })
  )
  return { layer, recorded }
}
