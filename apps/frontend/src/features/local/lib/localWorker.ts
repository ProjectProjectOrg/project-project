import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  DescriptionSource,
  localDescriptionsLayer,
  LocalRpcs,
  localRpcsLayer,
  LocalTimings,
  LocalWorkerInit,
  PendingWrite,
  PendingWrites,
  SaveOutcome,
  SyncDenied,
  SyncOffline,
  SyncSource
} from "@pp/local"
import {
  AppApi,
  GroupId,
  OPERATION_ID_HEADER,
  SYNC_RECEIPT_HEADER,
  TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
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

const descriptionSourceLayer = Layer.effect(
  DescriptionSource,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient
    const tickets = (operationId: string | null) =>
      HttpApiClient.group(AppApi, {
        group: "tickets",
        httpClient:
          operationId === null
            ? httpClient
            : httpClient.pipe(
                HttpClient.mapRequest(
                  HttpClientRequest.setHeader(OPERATION_ID_HEADER, operationId)
                )
              ),
        baseUrl: "/api"
      })
    const groups = HttpApiClient.group(AppApi, {
      group: "groups",
      httpClient,
      baseUrl: "/api"
    })
    return {
      fetch: (project, ids) =>
        tickets(null).pipe(
          Effect.flatMap((client) =>
            client.descriptions({
              params: project,
              query: { ids: ids.map((id) => TicketId.make(id)) }
            })
          ),
          Effect.catchTags({
            Conflict: Effect.die,
            Validation: Effect.die,
            NotFound: () => new SyncDenied(),
            Forbidden: () => new SyncDenied(),
            HttpClientError: () => new SyncOffline(),
            Unauthorized: () => new SyncOffline(),
            SchemaError: Effect.die
          })
        ),
      page: (project, token) =>
        tickets(null).pipe(
          Effect.flatMap((client) =>
            client.descriptionPage({
              params: project,
              query: token === null ? {} : { page: token }
            })
          ),
          Effect.catchTags({
            Conflict: Effect.die,
            Validation: Effect.die,
            NotFound: () => new SyncDenied(),
            Forbidden: () => new SyncDenied(),
            HttpClientError: () => new SyncOffline(),
            Unauthorized: () => new SyncOffline(),
            SchemaError: Effect.die
          })
        ),
      group: (project, id) =>
        groups.pipe(
          Effect.flatMap((client) =>
            client.get({ params: { ...project, id: GroupId.make(id) } })
          ),
          Effect.map((group): string | null => group.body),
          Effect.catchTags({
            Conflict: Effect.die,
            Validation: Effect.die,
            NotFound: () => Effect.succeed(null),
            Forbidden: () => new SyncDenied(),
            HttpClientError: () => new SyncOffline(),
            Unauthorized: () => new SyncOffline(),
            SchemaError: Effect.die
          })
        ),
      save: (project, id, input, operationId) =>
        tickets(operationId).pipe(
          Effect.flatMap((client) =>
            client.updateDescription({
              params: { ...project, id: TicketId.make(id) },
              payload: input
            })
          ),
          Effect.map((description) => SaveOutcome.Saved({ description })),
          Effect.catchTags({
            Conflict: ({ reason }) =>
              Effect.succeed(
                Match.value(reason).pipe(
                  Match.when("description_changed", () =>
                    SaveOutcome.Changed()
                  ),
                  Match.when("operation_pending", () => SaveOutcome.Pending()),
                  Match.orElse(() => SaveOutcome.Rejected({ reason }))
                )
              ),
            Validation: (error) =>
              Effect.succeed(SaveOutcome.Rejected({ reason: error.reason })),
            MentionInvalid: () =>
              Effect.succeed(
                SaveOutcome.Rejected({ reason: "mention_invalid" })
              ),
            NotFound: () =>
              Effect.succeed(SaveOutcome.Rejected({ reason: "not_found" })),
            Forbidden: () =>
              Effect.succeed(SaveOutcome.Rejected({ reason: "forbidden" })),
            HttpClientError: () => new SyncOffline(),
            Unauthorized: () => new SyncOffline(),
            SchemaError: Effect.die
          })
        )
    }
  })
).pipe(Layer.provide(FetchHttpClient.layer))

const engine = Layer.unwrap(
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId, timings }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(pendingWritesLayer),
      Layer.provide(
        localDescriptionsLayer.pipe(Layer.provide(descriptionSourceLayer))
      ),
      Layer.provide(localDatabaseLayer(userId)),
      Layer.provide(Layer.succeed(LocalTimings)(timings))
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
