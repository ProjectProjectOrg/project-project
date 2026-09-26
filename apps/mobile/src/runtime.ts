import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { FetchHttpClient } from "effect/unstable/http"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { seedSampleServers } from "@/servers/devSeed"
import { ExpoStorageLive } from "@/servers/expoStorage"
import { ServerStoreLive } from "@/servers/ServerStore"

const StoreLive = ServerStoreLive.pipe(Layer.provide(ExpoStorageLive))

const seedEnabled = __DEV__ && process.env.EXPO_PUBLIC_SEED_SERVERS === "1"

const DevSeedLive = Layer.effectDiscard(
  seedEnabled
    ? seedSampleServers.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Couldn’t seed sample servers", cause)
        )
      )
    : Effect.void
).pipe(Layer.provide(StoreLive))

export const appRuntime = Atom.runtime(
  Layer.mergeAll(
    StoreLive,
    Reactivity.layer,
    DevSeedLive,
    FetchHttpClient.layer
  )
)
