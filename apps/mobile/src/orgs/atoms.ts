import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"
import type { OrgLocation } from "@/servers/model"
import { ServerStore } from "@/servers/ServerStore"

export const orgKeys = {
  projects: (location: OrgLocation) =>
    [`orgs:${location.instanceId}:${location.orgSlug}:projects`] as const
}

export const rememberOrg = appRuntime.fn(
  Effect.fn("rememberOrg")(function* (location: OrgLocation) {
    const store = yield* ServerStore
    const current = yield* store.lastUsedOrg
    if (
      Option.exists(
        current,
        (saved) =>
          saved.instanceId === location.instanceId &&
          saved.orgSlug === location.orgSlug
      )
    ) {
      return
    }
    yield* store.setLastUsedOrg(location)
    yield* Reactivity.invalidate(serverKeys.lastUsed())
  })
)
