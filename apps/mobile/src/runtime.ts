import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { FetchHttpClient } from "effect/unstable/http"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { ExpoAuthLive } from "@/auth/expoAuth"
import { ServerAuth } from "@/auth/ServerAuth"
import { ViewCacheLive } from "@/cache/ViewCache"
import { seedSampleServers } from "@/servers/devSeed"
import { ExpoStorageLive } from "@/servers/expoStorage"
import { ServerStoreLive } from "@/servers/ServerStore"
import { TicketSnapshots } from "@/tickets/TicketSnapshots"

const StoreLive = ServerStoreLive.pipe(Layer.provide(ExpoStorageLive))

const CacheLive = ViewCacheLive.pipe(Layer.provide(ExpoStorageLive))

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

const AuthLive = ServerAuth.layer.pipe(
  Layer.provide([
    StoreLive,
    CacheLive,
    FetchHttpClient.layer,
    ExpoAuthLive,
    Reactivity.layer
  ])
)

const TicketSnapshotsLive = TicketSnapshots.layer.pipe(
  Layer.provide([AuthLive, CacheLive])
)

export const appRuntime = Atom.runtime(
  Layer.mergeAll(
    StoreLive,
    CacheLive,
    Reactivity.layer,
    DevSeedLive,
    FetchHttpClient.layer,
    AuthLive,
    TicketSnapshotsLive
  )
)
