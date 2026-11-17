import { Db } from "@pp/db"
import { githubPullRequest } from "@pp/db/schema"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export type PullRequestSnapshot = typeof githubPullRequest.$inferSelect

export type PullRequestKeys = Readonly<{
  repositoryId: string
  numbers: ReadonlyArray<number>
}>

export class PullRequestSnapshots extends Context.Service<
  PullRequestSnapshots,
  Readonly<{
    record: (
      snapshots: ReadonlyArray<PullRequestSnapshot>
    ) => Effect.Effect<void>
    find: (
      keys: ReadonlyArray<PullRequestKeys>
    ) => Effect.Effect<ReadonlyArray<PullRequestSnapshot>>
  }>
>()("@pp/server-core/github/PullRequestSnapshots") {}

const RECORD_CHUNK = 1000

const make = Effect.gen(function* () {
  const db = yield* Db

  const record = Effect.fn("PullRequestSnapshots.record")(function* (
    snapshots: ReadonlyArray<PullRequestSnapshot>
  ) {
    yield* Effect.forEach(
      Arr.chunksOf(snapshots, RECORD_CHUNK),
      (chunk) =>
        db
          .insert(githubPullRequest)
          .values([...chunk])
          .onConflictDoUpdate({
            target: [githubPullRequest.repositoryId, githubPullRequest.number],
            set: {
              branch: sql`excluded.branch`,
              base: sql`excluded.base`,
              state: sql`excluded.state`,
              draft: sql`excluded.draft`,
              title: sql`excluded.title`,
              mergedAt: sql`coalesce(excluded.merged_at, ${githubPullRequest.mergedAt})`,
              checks: sql`coalesce(excluded.checks, ${githubPullRequest.checks})`,
              observedAt: sql`excluded.observed_at`
            },
            setWhere: sql`${githubPullRequest.observedAt} <= excluded.observed_at`
          })
          .pipe(Effect.orDie),
      { discard: true }
    )
  })

  const find = Effect.fn("PullRequestSnapshots.find")(function* (
    keys: ReadonlyArray<PullRequestKeys>
  ) {
    const wanted = keys.filter((key) => key.numbers.length > 0)
    if (wanted.length === 0) return []
    return yield* db
      .select()
      .from(githubPullRequest)
      .where(
        or(
          ...wanted.map((key) =>
            and(
              eq(githubPullRequest.repositoryId, key.repositoryId),
              inArray(githubPullRequest.number, [...key.numbers])
            )
          )
        )
      )
      .pipe(Effect.orDie)
  })

  return PullRequestSnapshots.of({ record, find })
})

export const layer = Layer.effect(PullRequestSnapshots, make)
