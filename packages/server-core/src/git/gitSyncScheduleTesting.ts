import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { GitSyncSchedule, type SyncStatus } from "./GitSyncSchedule"

export const gitSyncScheduleTestLayer = (requested: Array<string> = []) => {
  const statuses = new Map<string, SyncStatus>()
  return Layer.succeed(GitSyncSchedule, {
    requestSync: (projectIds) =>
      Effect.sync(() => {
        requested.push(...projectIds)
      }),
    due: () => Effect.succeed([]),
    recordSync: (projectId, outcome) =>
      Effect.sync(() => {
        statuses.set(projectId, outcome.status)
      }),
    recordFailure: () => Effect.void,
    status: (projectId) => Effect.sync(() => statuses.get(projectId) ?? null)
  })
}
