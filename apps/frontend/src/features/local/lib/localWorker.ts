import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  LocalRpcs,
  localRpcsLayer,
  LocalWorkerInit,
  PendingWrite,
  PendingWrites,
  SyncDenied,
  SyncOffline,
  SyncSource
} from "@pp/local"
import { AppApi, OPERATION_ID_HEADER, SYNC_RECEIPT_HEADER } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import { RpcServer, RpcWorker } from "effect/rpc"

import { browserCrypto } from "@/lib/browserCrypto"

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
      pull: (project, query) =>
        client.project({ params: project, query }).pipe(
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

const receiptOf = (response: HttpClientResponse.HttpClientResponse) =>
  response.headers[SYNC_RECEIPT_HEADER] ?? ""

const pendingWritesLayer = Layer.effect(
  PendingWrites,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient
    const send: PendingWrites["Service"]["send"] = (
      project,
      operationId,
      write
    ) =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.group(AppApi, {
          group: "tickets",
          httpClient: HttpClient.mapRequest(
            httpClient,
            HttpClientRequest.setHeader(OPERATION_ID_HEADER, operationId)
          ),
          baseUrl: "/api"
        })
        if (PendingWrite.guards.update(write)) {
          const [, response] = yield* client.update({
            params: { ...project, id: write.ticket },
            query: {},
            payload: write.payload,
            responseMode: "decoded-and-response"
          })
          return receiptOf(response)
        }
        const [, response] = yield* client.bulkUpdate({
          params: project,
          payload: write.payload,
          responseMode: "decoded-and-response"
        })
        return receiptOf(response)
      }).pipe(
        Effect.catchTags({
          Conflict: (conflict) =>
            conflict.reason === "operation_pending"
              ? Effect.fail(new SyncOffline())
              : Effect.fail(conflict),
          HttpClientError: () => Effect.fail(new SyncOffline()),
          Unauthorized: () => Effect.fail(new SyncOffline()),
          SchemaError: Effect.die
        })
      )
    return {
      operationId: browserCrypto.randomUUIDv4().pipe(Effect.orDie),
      send
    }
  })
).pipe(Layer.provide(FetchHttpClient.layer))

const engine = Layer.unwrap(
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(pendingWritesLayer),
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
