import type { ConnectEverhourProfileInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"

export type EverhourProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const everhourProjectRequest = (
  orgSlug: string,
  slug: string
): EverhourProjectRequest => ({
  params: { orgSlug, slug }
})

const scopeOf = (req: EverhourProjectRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const everhourProfileQuery = query("everhour", "profile", {
  timeToLive: "1 minute",
  reactivityKeys: [Keys.everhourProfile()]
})

export const everhourProfileAtom = Atom.optimistic(everhourProfileQuery)

export const connectEverhourProfileAtom = viewMutation(everhourProfileAtom, {
  name: "connectEverhourProfile",
  predict: (profile, _input: ConnectEverhourProfileInput) => ({
    ...profile,
    connected: true,
    lastCheckError: null
  }),
  call: (client, input) => client.everhour.connectProfile({ payload: input }),
  confirm: replaceWith,
  publish: () => [Keys.me()]
})

export const disconnectEverhourProfileAtom = viewMutation(everhourProfileAtom, {
  name: "disconnectEverhourProfile",
  predict: (_profile, _input: void) => ({
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }),
  call: (client) => client.everhour.disconnectProfile(),
  confirm: replaceWith,
  publish: () => [Keys.me()]
})

const everhourProjectQuery = (req: EverhourProjectRequest) =>
  query("everhour", "projectStatus", {
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
          Effect.fn("connectEverhourProject")(function* (_input: void) {
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
          Effect.fn("syncEverhourProject")(function* (_input: void) {
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
    viewMutation(everhourProjectStatusAtom(req), {
      name: "disconnectEverhourProject",
      predict: (status, _input: void) => ({
        ...status,
        status: "not_connected" as const,
        everhourProjectId: null,
        everhourProjectName: null,
        lastSyncedAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        needsSync: false
      }),
      call: (client) =>
        client.everhour.disconnectProject({ params: req.params }),
      confirm: replaceWith
    })
)
