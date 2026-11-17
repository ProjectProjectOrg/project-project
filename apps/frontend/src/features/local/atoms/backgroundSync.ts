import { scopeOf } from "@pp/local"
import type { LocalProject } from "@pp/local"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Api } from "@/api/Api"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import {
  project,
  projectRequest,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  backlogFirstScreen,
  backlogGroupingFor
} from "@/features/tickets/atoms/backlogFirstScreen"
import { ticketQueryFromSearch } from "@/features/tickets/lib/ticketSearch"
import {
  createLocalStorageCodec,
  readLocalStorage,
  writeLocalStorage
} from "@/hooks/useLocalStorageState"

import {
  backgroundCandidates,
  syncInBackground,
  withOpened
} from "../lib/backgroundSync"
import { Connection } from "../lib/backgroundSync"
import type { StorageEstimate } from "../lib/backgroundSync"
import { LocalClient } from "../lib/localClient"
import { persistStorageOnce } from "../lib/persistStorage"
import { localActive } from "./localActive"
import { localProject, localRuntime } from "./localProject"

const OPENED_KEY = "pp:opened-projects"
const IDLE_FALLBACK = "2 seconds"
const QUIET = "1 second"
const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"]
const WARM_TIMEOUT = "15 seconds"

const openedCodec = createLocalStorageCodec(
  Schema.Struct({
    userId: Schema.String,
    projects: Schema.Array(
      Schema.Struct({
        orgSlug: Schema.String,
        slug: Schema.String,
        openedAt: Schema.Finite
      })
    )
  })
)

const readOpened = (userId: string) => {
  const saved = readLocalStorage(OPENED_KEY, openedCodec, {
    userId,
    projects: []
  })
  return saved.userId === userId ? saved.projects : []
}

const backgroundSyncedAt = Atom.make<ReadonlyMap<string, number>>(
  new Map()
).pipe(Atom.keepAlive)

const nextInput = Effect.callback<void>((resume) => {
  const controller = new AbortController()
  for (const type of INPUT_EVENTS)
    addEventListener(type, () => resume(Effect.void), {
      capture: true,
      passive: true,
      signal: controller.signal
    })
  return Effect.sync(() => controller.abort())
})

const quiet: Effect.Effect<void> = nextInput.pipe(
  Effect.timeoutOption(QUIET),
  Effect.flatMap((input) =>
    Option.isSome(input) ? Effect.suspend(() => quiet) : Effect.void
  )
)

const idle = quiet.pipe(
  Effect.andThen(
    Effect.suspend(() =>
      "requestIdleCallback" in window
        ? Effect.callback<void>((resume) => {
            const id = requestIdleCallback(() => resume(Effect.void))
            return Effect.sync(() => cancelIdleCallback(id))
          })
        : Effect.sleep(IDLE_FALLBACK)
    )
  )
)

const decodeConnection = Schema.decodeUnknownOption(Connection)

const readConnection = Effect.sync(() =>
  "connection" in navigator
    ? Option.getOrNull(decodeConnection(navigator.connection))
    : null
)

const readStorage = Effect.promise(
  async (): Promise<StorageEstimate | null> => {
    if (!("storage" in navigator)) return null
    try {
      const { usage, quota } = await navigator.storage.estimate()
      return usage === undefined || quota === undefined
        ? null
        : { usage, quota }
    } catch {
      return null
    }
  }
)

const settle = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
) =>
  AtomRegistry.mount(registry, atom).pipe(
    Effect.andThen(
      AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })
    ),
    Effect.ignore
  )

const warmFirstScreen = (
  registry: AtomRegistry.AtomRegistry,
  viewerId: string,
  { orgSlug, slug }: LocalProject
) => {
  registry.set(localActive(scopeOf({ orgSlug, slug })), true)
  const view = backlogFirstScreen(
    orgSlug,
    slug,
    ticketQueryFromSearch({}),
    backlogGroupingFor(viewerId, orgSlug, slug)
  ).map((atom) => settle(registry, atom))
  return Effect.all(
    [
      settle(registry, project(projectRequest(orgSlug, slug))),
      settle(registry, statusesFor(statusesRequest(orgSlug, slug))),
      settle(registry, sprintList(sprintListRequest(orgSlug, slug))),
      settle(registry, projectLibraryFor(projectLibraryRequest(orgSlug, slug))),
      ...view
    ],
    { concurrency: "unbounded", discard: true }
  ).pipe(Effect.scoped, Effect.timeoutOption(WARM_TIMEOUT), Effect.asVoid)
}

const orgProjects = (registry: AtomRegistry.AtomRegistry, orgSlug: string) =>
  AtomRegistry.getResult(registry, projectsFor(projectsRequest(orgSlug))).pipe(
    Effect.map((projects) =>
      [...projects]
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((entry) => ({ orgSlug: entry.org, slug: entry.slug }))
    ),
    Effect.timeoutOption("10 seconds"),
    Effect.map(Option.getOrElse(() => [])),
    Effect.orElseSucceed(() => [])
  )

export const backgroundSync = Atom.family((current: LocalProject) =>
  localRuntime.atom((get) =>
    Effect.gen(function* () {
      const userId = get(currentUserId)
      if (userId === undefined) return
      const registry = get.registry
      const client = yield* LocalClient
      const api = yield* Api
      const opened = readOpened(userId)
      writeLocalStorage(OPENED_KEY, openedCodec, {
        userId,
        projects: withOpened(opened, current, yield* Clock.currentTimeMillis)
      })
      yield* AtomRegistry.toStream(registry, localProject(current)).pipe(
        Stream.filter(
          (status) =>
            AsyncResult.isSuccess(status) &&
            status.value.kind === "ready" &&
            status.value.sync === "live"
        ),
        Stream.runHead
      )
      yield* persistStorageOnce
      const candidates = backgroundCandidates({
        current,
        opened,
        orgProjects: yield* orgProjects(registry, current.orgSlug),
        syncedAt: registry.get(backgroundSyncedAt),
        now: yield* Clock.currentTimeMillis
      })
      yield* syncInBackground(candidates, {
        idle,
        input: nextInput,
        connection: readConnection,
        hydrated: (project) =>
          client.Hydrated(project).pipe(Effect.orElseSucceed(() => false)),
        ticketCount: (project) =>
          api.tickets.count({ params: project, query: {} }).pipe(
            Effect.map(({ total }) => total),
            Effect.orElseSucceed(() => null)
          ),
        storage: readStorage,
        sync: (project) =>
          client.Pull(project).pipe(
            Effect.tap((status) =>
              status.kind === "ready" && status.sync === "live"
                ? Effect.flatMap(Clock.currentTimeMillis, (now) =>
                    Effect.sync(() =>
                      registry.update(backgroundSyncedAt, (synced) =>
                        new Map(synced).set(scopeOf(project), now)
                      )
                    )
                  )
                : Effect.void
            ),
            Effect.orElseSucceed(() => ({ kind: "failed" as const }))
          ),
        warm: (project) => warmFirstScreen(registry, userId, project)
      })
    })
  )
)
