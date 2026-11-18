import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import {
  PullRequestSnapshots,
  type PullRequestSnapshot
} from "./PullRequestSnapshots"

const rowKey = (repositoryId: string, number: number) =>
  `${repositoryId}#${number}`

export const pullRequestSnapshotsTestLayer = (
  initial: ReadonlyArray<PullRequestSnapshot> = []
) => {
  const rows = new Map(
    initial.map((row) => [rowKey(row.repositoryId, row.number), row])
  )
  return Layer.succeed(PullRequestSnapshots, {
    record: (snapshots) =>
      Effect.sync(() => {
        for (const snapshot of snapshots) {
          const id = rowKey(snapshot.repositoryId, snapshot.number)
          const existing = rows.get(id)
          if (existing && existing.observedAt > snapshot.observedAt) continue
          rows.set(id, {
            ...snapshot,
            mergedAt: snapshot.mergedAt ?? existing?.mergedAt ?? null,
            checks: snapshot.checks ?? existing?.checks ?? null
          })
        }
      }),
    find: (keys) =>
      Effect.sync(() =>
        keys.flatMap((wanted) =>
          wanted.numbers.flatMap((number) => {
            const row = rows.get(rowKey(wanted.repositoryId, number))
            return row ? [row] : []
          })
        )
      )
  })
}
