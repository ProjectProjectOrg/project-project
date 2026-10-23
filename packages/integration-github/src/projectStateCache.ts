import type { GitHubError, RateLimited, RepoGone } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { Mutable } from "effect/Types"

import type { RawProjectStates } from "./GitHub"

type ProjectStateFailure = RepoGone | RateLimited | GitHubError

type EntryState = Readonly<{
  run?: Effect.Effect<RawProjectStates, ProjectStateFailure>
  snapshot?: RawProjectStates
}>

type Entry = Readonly<{
  installationId: string
  repoKey: string
  state: Mutable<EntryState>
}>

const LIMIT = 128

export class ProjectStateCache extends Context.Service<
  ProjectStateCache,
  Readonly<{
    cachedProjectStates: (
      key: string,
      installationId: string,
      repoKey: string,
      fetch: Effect.Effect<RawProjectStates, ProjectStateFailure>
    ) => Effect.Effect<RawProjectStates, ProjectStateFailure>
    invalidateForRepo: (repoKey: string) => Effect.Effect<void>
    invalidateForInstallation: (installationId: string) => Effect.Effect<void>
  }>
>()("@pp/integration-github/projectStateCache") {}

export const make = (): ProjectStateCache["Service"] => {
  const entries = new Map<string, Entry>()

  const cachedProjectStates = Effect.fn("GitHub.cachedProjectStates")(
    function* (
      key: string,
      installationId: string,
      repoKey: string,
      fetch: Effect.Effect<RawProjectStates, ProjectStateFailure>
    ): Effect.fn.Return<RawProjectStates, ProjectStateFailure> {
      const entry = yield* Effect.sync(() => {
        const existing = entries.get(key)
        if (existing) return existing
        const created: Entry = { installationId, repoKey, state: {} }
        if (entries.size >= LIMIT) {
          const oldestKey = entries.keys().next().value
          if (oldestKey !== undefined) entries.delete(oldestKey)
        }
        entries.set(key, created)
        return created
      })
      if (!entry.state.run) {
        const run = yield* Effect.cachedWithTTL(fetch, "15 seconds")
        entry.state.run ??= run
      }
      const run = entry.state.run
      return yield* run.pipe(
        Effect.map((value): RawProjectStates => {
          if (entries.get(key) !== entry)
            return { ...value, refreshStatus: "stale" }
          entry.state.snapshot = value
          return value
        }),
        Effect.tapErrorTag("RepoGone", () =>
          Effect.sync(() => {
            if (entry.state.run === run) entry.state.snapshot = undefined
          })
        ),
        Effect.tapError(() =>
          Effect.sync(() => {
            if (entry.state.run === run) {
              entry.state.run = undefined
            }
          })
        ),
        Effect.catchTags({
          RateLimited: (error) => {
            if (entries.get(key) !== entry || !entry.state.snapshot)
              return Effect.fail(error)
            return Effect.succeed({
              ...entry.state.snapshot,
              refreshStatus: "rate_limited" as const,
              retryAt: error.resetAt
            })
          },
          GitHubError: (error) => {
            if (entries.get(key) !== entry || !entry.state.snapshot)
              return Effect.fail(error)
            return Effect.succeed({
              ...entry.state.snapshot,
              refreshStatus: "stale" as const
            })
          }
        })
      )
    }
  )

  const invalidateForRepo = (repoKey: string) =>
    Effect.sync(() => {
      for (const [key, entry] of entries) {
        if (entry.repoKey === repoKey.toLowerCase()) entries.delete(key)
      }
    })

  const invalidateForInstallation = (installationId: string) =>
    Effect.sync(() => {
      for (const [key, entry] of entries) {
        if (entry.installationId === installationId) entries.delete(key)
      }
    })

  return ProjectStateCache.of({
    cachedProjectStates,
    invalidateForRepo,
    invalidateForInstallation
  })
}

export const layer = Layer.sync(ProjectStateCache, make)

export const projectStateCacheKey = (
  installationId: string,
  owner: string,
  name: string,
  branches: ReadonlyArray<string>,
  branchQuery: string | undefined
): Readonly<{ key: string; repoKey: string }> => {
  const repoKey = `${owner.toLowerCase()}\0${name.toLowerCase()}`
  return {
    key: JSON.stringify([
      installationId,
      repoKey,
      branchQuery,
      [...new Set(branches)].toSorted()
    ]),
    repoKey
  }
}
