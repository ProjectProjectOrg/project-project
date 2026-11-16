import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  DescriptionSource,
  localDescriptionsLayer,
  LocalRpcs,
  localRpcsLayer,
  LocalWorkerInit,
  SaveOutcome,
  SyncDenied,
  SyncOffline,
  SyncSource
} from "@pp/local"
import { AppApi, OPERATION_ID_HEADER, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
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
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(
        localDescriptionsLayer.pipe(Layer.provide(descriptionSourceLayer))
      ),
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
