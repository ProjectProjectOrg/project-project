import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  LocalRpcs,
  localRpcsLayer,
  LocalWorkerInit,
  SyncDenied,
  SyncOffline,
  SyncSource
} from "@pp/local"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import { RpcServer, RpcWorker } from "effect/rpc"

import { localDatabaseLayer } from "./localDatabase"

const syncSourceLayer = Layer.effect(
  SyncSource,
  Effect.gen(function* () {
    const client = yield* HttpApiClient.group(AppApi, {
      group: "sync",
      httpClient: yield* HttpClient.HttpClient,
      baseUrl: "/api"
    })
    return {
      pull: (project, after) =>
        client
          .project({ params: project, query: after === null ? {} : { after } })
          .pipe(
            Effect.catchTags({
              NotFound: () => new SyncDenied(),
              Forbidden: () => new SyncDenied(),
              HttpClientError: () => new SyncOffline(),
              Unauthorized: Effect.die,
              SchemaError: Effect.die
            })
          )
    }
  })
).pipe(Layer.provide(FetchHttpClient.layer))

const engine = Layer.unwrap(
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(localDatabaseLayer(userId))
    )
  )
)

RpcServer.layer(LocalRpcs).pipe(
  Layer.provide(engine),
  Layer.provideMerge(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
  Layer.launch,
  BrowserRuntime.runMain
)
