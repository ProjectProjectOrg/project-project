import * as Effect from "effect/Effect"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/atoms"
import { ServerStore } from "@/servers/ServerStore"

import { type CheckedServer, checkServer } from "./checkServer"

export const checkServerAtom = appRuntime.fn(checkServer)

export const saveCheckedServer = appRuntime.fn(
  Effect.fn("saveCheckedServer")(function* ({
    origin,
    descriptor
  }: CheckedServer) {
    const store = yield* ServerStore
    yield* store.register({
      instanceId: descriptor.instanceId,
      origin,
      name: descriptor.name,
      logo: descriptor.logo,
      protocolVersion: descriptor.protocolVersion
    })
    yield* Reactivity.invalidate(serverKeys.catalog())
    return descriptor.instanceId
  })
)
