import * as BrowserWorker from "@effect/platform-browser/BrowserWorker"
import { LocalRpcs, LocalWorkerInit } from "@pp/local"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { RpcClient, RpcWorker } from "effect/rpc"

const OPEN_REQUESTS_PER_WORKER = 1024

const makeClient = RpcClient.make(LocalRpcs)

const spawn = () => {
  const worker = new Worker(new URL("./localWorker.ts", import.meta.url), {
    type: "module",
    name: "pp-local"
  })
  addEventListener("pagehide", (event) => {
    if (!event.persisted) worker.terminate()
  })
  return worker
}

export class LocalClient extends Context.Service<
  LocalClient,
  Effect.Success<typeof makeClient>
>()("@pp/frontend/features/local/lib/localClient") {}

export const localClientLayer = (userId: string) =>
  Layer.effect(LocalClient, makeClient).pipe(
    Layer.provide(
      RpcClient.layerProtocolWorker({
        size: 1,
        concurrency: OPEN_REQUESTS_PER_WORKER
      })
    ),
    Layer.provide(
      RpcWorker.layerInitialMessage(LocalWorkerInit, Effect.succeed({ userId }))
    ),
    Layer.provide(BrowserWorker.layer(spawn))
  )
