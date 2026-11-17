import { scopeOf } from "@pp/local"
import type { LocalProject, LocalStatus } from "@pp/local"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export const BACKGROUND_LIMIT = 5
export const LARGE_PROJECT_TICKETS = 50_000
export const RECENTLY_OPENED_MS = 14 * 24 * 60 * 60 * 1000
export const RESYNC_AFTER_MS = 10 * 60 * 1000
export const BYTES_PER_TICKET = 2_500
export const MIN_FREE_BYTES = 200 * 1024 * 1024

export type OpenedProject = Readonly<{
  orgSlug: string
  slug: string
  openedAt: number
}>

export type Candidate = Readonly<{
  project: LocalProject
  openedAt: number | null
}>

export const Connection = Schema.Struct({
  saveData: Schema.optional(Schema.Boolean),
  effectiveType: Schema.optional(Schema.String)
})
export type Connection = typeof Connection.Type

export type StorageEstimate = Readonly<{ usage: number; quota: number }>

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"])

export const withOpened = (
  opened: ReadonlyArray<OpenedProject>,
  project: LocalProject,
  now: number
): ReadonlyArray<OpenedProject> => [
  { orgSlug: project.orgSlug, slug: project.slug, openedAt: now },
  ...opened
    .filter((entry) => scopeOf(entry) !== scopeOf(project))
    .slice(0, BACKGROUND_LIMIT)
]

export const backgroundCandidates = (
  input: Readonly<{
    current: LocalProject
    opened: ReadonlyArray<OpenedProject>
    orgProjects: ReadonlyArray<LocalProject>
    syncedAt: ReadonlyMap<string, number>
    now: number
  }>
): ReadonlyArray<Candidate> => {
  const seen = new Set([scopeOf(input.current)])
  const candidates: Array<Candidate> = []
  const consider = (project: LocalProject, openedAt: number | null) => {
    const scope = scopeOf(project)
    if (seen.has(scope)) return
    seen.add(scope)
    candidates.push({
      project: { orgSlug: project.orgSlug, slug: project.slug },
      openedAt
    })
  }
  for (const entry of [...input.opened].toSorted(
    (a, b) => b.openedAt - a.openedAt
  ))
    consider(entry, entry.openedAt)
  for (const project of input.orgProjects) consider(project, null)
  return candidates
    .slice(0, BACKGROUND_LIMIT)
    .filter(
      ({ project }) =>
        input.now - (input.syncedAt.get(scopeOf(project)) ?? -Infinity) >=
        RESYNC_AFTER_MS
    )
}

export const connectionAllows = (connection: Connection | null): boolean =>
  connection === null ||
  (connection.saveData !== true &&
    (connection.effectiveType === undefined ||
      !SLOW_CONNECTIONS.has(connection.effectiveType)))

export const firstSyncAllowed = (
  input: Readonly<{
    candidate: Candidate
    ticketCount: number
    storage: StorageEstimate | null
    now: number
  }>
): boolean => {
  const openedRecently =
    input.candidate.openedAt !== null &&
    input.now - input.candidate.openedAt < RECENTLY_OPENED_MS
  if (!openedRecently && input.ticketCount > LARGE_PROJECT_TICKETS) return false
  if (input.storage === null) return true
  return (
    input.storage.quota - input.storage.usage >=
    2 * input.ticketCount * BYTES_PER_TICKET + MIN_FREE_BYTES
  )
}

export type BackgroundSteps = Readonly<{
  idle: Effect.Effect<void>
  input: Effect.Effect<void>
  connection: Effect.Effect<Connection | null>
  hydrated: (project: LocalProject) => Effect.Effect<boolean>
  ticketCount: (project: LocalProject) => Effect.Effect<number | null>
  storage: Effect.Effect<StorageEstimate | null>
  sync: (project: LocalProject) => Effect.Effect<LocalStatus>
  warm: (project: LocalProject) => Effect.Effect<void>
}>

const yieldingToInput = (
  steps: BackgroundSteps,
  project: LocalProject
): Effect.Effect<LocalStatus> =>
  Effect.raceFirst(
    steps.sync(project).pipe(Effect.map(Option.some)),
    steps.input.pipe(Effect.as(Option.none<LocalStatus>()))
  ).pipe(
    Effect.flatMap(
      Option.match({
        onSome: Effect.succeed,
        onNone: () =>
          steps.idle.pipe(Effect.andThen(yieldingToInput(steps, project)))
      })
    )
  )

export const syncInBackground = (
  candidates: ReadonlyArray<Candidate>,
  steps: BackgroundSteps
): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      yield* steps.idle
      if (!connectionAllows(yield* steps.connection)) return
      if (!(yield* steps.hydrated(candidate.project))) {
        const ticketCount = yield* steps.ticketCount(candidate.project)
        if (ticketCount === null) continue
        const allowed = firstSyncAllowed({
          candidate,
          ticketCount,
          storage: yield* steps.storage,
          now: yield* Clock.currentTimeMillis
        })
        if (!allowed) continue
      }
      const status = yield* yieldingToInput(steps, candidate.project)
      if (status.kind === "ready" && status.sync === "live")
        yield* steps.warm(candidate.project)
      else if (status.kind === "ready") return
    }
  })
