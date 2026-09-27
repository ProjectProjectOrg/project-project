import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { ServerAuth } from "@/auth/ServerAuth"
import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"
import type { OrgLocation } from "@/servers/model"
import { ServerStore } from "@/servers/ServerStore"

export const orgKeys = {
  projects: (location: OrgLocation) =>
    ["orgs", location.instanceId, location.orgSlug, "projects"] as const
}

const locationKey = (location: OrgLocation) =>
  `${location.instanceId} ${location.orgSlug}`

const locationOf = (key: string): OrgLocation => {
  const [instanceId = "", orgSlug = ""] = key.split(" ")
  return { instanceId, orgSlug }
}

const projectsFamily = Atom.family((key: string) => {
  const location = locationOf(key)
  return appRuntime
    .atom(
      Effect.gen(function* () {
        const auth = yield* ServerAuth
        const api = yield* auth.api(location.instanceId)
        return yield* api.projects.list({
          params: { orgSlug: location.orgSlug }
        })
      })
    )
    .pipe(Atom.withReactivity(orgKeys.projects(location)))
})

export const orgProjects = (location: OrgLocation) =>
  projectsFamily(locationKey(location))

export const rememberOrg = appRuntime.fn(
  Effect.fn("rememberOrg")(function* (location: OrgLocation) {
    const store = yield* ServerStore
    yield* store.setLastUsedOrg(location)
    yield* Reactivity.invalidate(serverKeys.catalog())
  })
)
