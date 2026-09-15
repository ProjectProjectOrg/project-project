import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type { ConnectEverhourProfileInput } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface EverhourProjectRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const everhourProjectRequest = (
  orgSlug: string,
  slug: string
): EverhourProjectRequest => ({
  params: { orgSlug, slug }
})

const scopeOf = (req: EverhourProjectRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const everhourProfileQuery = Api.query("everhour", "profile", {
  timeToLive: "1 minute",
  reactivityKeys: [Keys.everhourProfile()]
})

export const everhourProfileAtom = Atom.optimistic(everhourProfileQuery)

export const connectEverhourProfileAtom = Atom.optimisticFn(
  everhourProfileAtom,
  {
    reducer: (current, _input: ConnectEverhourProfileInput) =>
      AsyncResult.map(current, (profile) => ({
        ...profile,
        connected: true,
        lastCheckError: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ConnectEverhourProfileInput) {
          const profile = yield* Api.use((client) =>
            client.everhour.connectProfile({ payload: input })
          )
          set(AsyncResult.success(profile))
          yield* Reactivity.invalidate([Keys.me()])
          return profile
        })
      )
  }
)

export const disconnectEverhourProfileAtom = Atom.optimisticFn(
  everhourProfileAtom,
  {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, () => ({
        connected: false,
        everhourUserId: null,
        name: null,
        email: null,
        lastVerifiedAt: null,
        lastCheckError: null
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const profile = yield* Api.use((client) =>
            client.everhour.disconnectProfile()
          )
          set(AsyncResult.success(profile))
          yield* Reactivity.invalidate([Keys.me()])
          return profile
        })
      )
  }
)

const everhourProjectQuery = (req: EverhourProjectRequest) =>
  Api.query("everhour", "projectStatus", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.everhourProject(scopeOf(req))]
  })

export const everhourProjectStatusAtom = Atom.family(
  (req: EverhourProjectRequest) => Atom.optimistic(everhourProjectQuery(req))
)

export const connectEverhourProjectAtom = Atom.family(
  (req: EverhourProjectRequest) =>
    Atom.optimisticFn(everhourProjectStatusAtom(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (status) => ({
          ...status,
          status: "active" as const,
          lastSyncStatus: "ok" as const,
          lastSyncError: null,
          needsSync: false
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            const summary = yield* Api.use((client) =>
              client.everhour.connectProject({ params: req.params })
            )
            const status = yield* Api.use((client) =>
              client.everhour.projectStatus({ params: req.params })
            )
            set(AsyncResult.success(status))
            return summary
          })
        )
    })
)

export const syncEverhourProjectAtom = Atom.family(
  (req: EverhourProjectRequest) =>
    Atom.optimisticFn(everhourProjectStatusAtom(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (status) => status),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            const summary = yield* Api.use((client) =>
              client.everhour.syncProject({ params: req.params })
            )
            const status = yield* Api.use((client) =>
              client.everhour.projectStatus({ params: req.params })
            )
            set(AsyncResult.success(status))
            return summary
          })
        )
    })
)

export const disconnectEverhourProjectAtom = Atom.family(
  (req: EverhourProjectRequest) =>
    Atom.optimisticFn(everhourProjectStatusAtom(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (status) => ({
          ...status,
          status: "not_connected" as const,
          everhourProjectId: null,
          everhourProjectName: null,
          lastSyncedAt: null,
          lastSyncStatus: null,
          lastSyncError: null,
          needsSync: false
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            const status = yield* Api.use((client) =>
              client.everhour.disconnectProject({ params: req.params })
            )
            set(AsyncResult.success(status))
            return status
          })
        )
    })
)
