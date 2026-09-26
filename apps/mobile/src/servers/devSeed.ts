import { appProtocolVersion } from "@pp/shared"
import * as Effect from "effect/Effect"

import type { SavedServer } from "./model"
import { ServerStore } from "./ServerStore"

const sampleUser = { id: "dev-user", name: "Luuk", email: "luuk@igne.nl" }

export const sampleServers: ReadonlyArray<SavedServer> = [
  {
    instanceId: "dev-igne",
    origin: "https://pp.igne.nl",
    name: "Igne",
    logo: null,
    protocolVersion: appProtocolVersion,
    user: sampleUser,
    orgs: [
      { slug: "igne", name: "Igne" },
      { slug: "igne-labs", name: "Igne Labs" }
    ]
  },
  {
    instanceId: "dev-client",
    origin: "https://pp.client.nl",
    name: "Client",
    logo: null,
    protocolVersion: appProtocolVersion,
    user: sampleUser,
    orgs: [{ slug: "clientco", name: "ClientCo" }]
  }
]

export const seedSampleServers = Effect.gen(function* () {
  const store = yield* ServerStore
  const existing = yield* store.list
  if (existing.length > 0) return
  yield* Effect.forEach(sampleServers, store.save, { discard: true })
})
