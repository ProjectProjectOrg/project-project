import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  type InboxMark,
  InboxRejected,
  InboxSource,
  LocalRpcs,
  localRpcsLayer,
  LocalWorkerInit,
  SyncDenied,
  SyncOffline,
  privateReceipt,
  SyncSource
} from "@pp/local"
import { AppApi, OPERATION_ID_HEADER, SYNC_RECEIPT_HEADER } from "@pp/shared"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
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

const inboxSourceLayer = (userId: string) =>
  Layer.effect(
    InboxSource,
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient
      const sync = yield* HttpApiClient.group(AppApi, {
        group: "privateSync",
        httpClient,
        baseUrl: "/api"
      })
      const send = Effect.fnUntraced(function* (
        operationId: string,
        mark: InboxMark
      ) {
        const inbox = yield* HttpApiClient.group(AppApi, {
          group: "inbox",
          httpClient: httpClient.pipe(
            HttpClient.mapRequest(
              HttpClientRequest.setHeader(OPERATION_ID_HEADER, operationId)
            )
          ),
          baseUrl: "/api"
        })
        const responseMode = "decoded-and-response" as const
        const params = { orgSlug: mark.orgSlug }
        if (!("ticketId" in mark)) {
          const all = { readAll: inbox.readAll, doneAll: inbox.doneAll }
          return yield* all[mark.kind]({ params, responseMode })
        }
        const one = {
          read: inbox.markRead,
          unread: inbox.markUnread,
          done: inbox.markDone
        }
        return yield* one[mark.kind]({
          params: { ...params, slug: mark.projectSlug, id: mark.ticketId },
          responseMode
        })
      })
      return {
        pull: (query) =>
          sync.pull({ params: { userId }, query }).pipe(
            Effect.catchTags({
              Forbidden: () => new SyncDenied(),
              HttpClientError: () => new SyncOffline(),
              Unauthorized: Effect.die,
              SchemaError: Effect.die
            })
          ),
        mark: (operationId, mark) =>
          send(operationId, mark).pipe(
            Effect.map(([, response]) =>
              privateReceipt(response.headers[SYNC_RECEIPT_HEADER])
            ),
            Effect.catchTags({
              HttpClientError: () => new SyncOffline(),
              SchemaError: Effect.die
            }),
            Effect.catch(() => new InboxRejected())
          )
      }
    })
  ).pipe(Layer.provide(FetchHttpClient.layer))

const engine = Layer.unwrap(
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(inboxSourceLayer(userId)),
      Layer.provide(Layer.succeed(Crypto.Crypto, browserCrypto)),
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
