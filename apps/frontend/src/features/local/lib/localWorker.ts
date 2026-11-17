import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime"
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import {
  DescriptionSource,
  LastView,
  localDescriptionsLayer,
  LocalRpcs,
  localRpcsLayer,
  LocalTimings,
  LocalWorkerInit,
  PendingWrite,
  PendingWrites,
  prefetchView,
  SaveOutcome,
  SyncDenied,
  SyncOffline,
  SyncSource,
  WarmView
} from "@pp/local"
import {
  GroupId,
  GroupsGroup,
  OPERATION_ID_HEADER,
  SYNC_RECEIPT_HEADER,
  SyncGroup,
  TicketId,
  TicketsGroup
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { HttpApi, HttpApiClient } from "effect/http-api"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import { RpcServer, RpcWorker } from "effect/rpc"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"

import { browserCrypto } from "@/lib/browserCrypto"

import { localDatabaseLayer } from "./localDatabase"

const LocalApi = HttpApi.make("local")
  .add(SyncGroup)
  .add(TicketsGroup)
  .add(GroupsGroup)

const syncSourceLayer = Layer.effect(
  SyncSource,
  Effect.gen(function* () {
    const client = yield* HttpApiClient.group(LocalApi, {
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
    const clients = (operationId: string) => {
      const options = {
        httpClient: HttpClient.mapRequest(
          httpClient,
          HttpClientRequest.setHeader(OPERATION_ID_HEADER, operationId)
        ),
        baseUrl: "/api"
      }
      return Effect.all({
        tickets: HttpApiClient.group(LocalApi, {
          group: "tickets",
          ...options
        }),
        groups: HttpApiClient.group(LocalApi, { group: "groups", ...options })
      })
    }
    const sent = (
      response: HttpClientResponse.HttpClientResponse,
      created: TicketId | null = null
    ) => ({ receipt: receiptOf(response), created })
    const send: PendingWrites["Service"]["send"] = (
      project,
      operationId,
      write
    ) =>
      Effect.gen(function* () {
        const { tickets, groups } = yield* clients(operationId)
        return yield* PendingWrite.match(write, {
          update: ({ ticket, payload }) =>
            tickets
              .update({
                params: { ...project, id: ticket },
                query: {},
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          bulk: ({ payload }) =>
            tickets
              .bulkUpdate({
                params: project,
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          create: ({ payload, sprint }) =>
            Effect.gen(function* () {
              const [created, response] = yield* tickets.create({
                params: project,
                payload,
                responseMode: "decoded-and-response"
              })
              if (sprint === null) return sent(response, created.id)
              const sprintStep = yield* clients(`${operationId}-sprint`)
              const [, added] = yield* sprintStep.groups.addTickets({
                params: { ...project, id: sprint },
                payload: { tickets: [created.id] },
                responseMode: "decoded-and-response"
              })
              return sent(added, created.id)
            }),
          archive: ({ ticket, payload }) =>
            tickets
              .archive({
                params: { ...project, id: ticket },
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          bulkArchive: ({ payload }) =>
            tickets
              .bulkArchive({
                params: project,
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          restore: ({ ticket }) =>
            tickets
              .unarchive({
                params: { ...project, id: ticket },
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          delete: ({ payload }) =>
            tickets
              .bulkDelete({
                params: project,
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          updateGroup: ({ group, payload }) =>
            groups
              .update({
                params: { ...project, id: group },
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response))),
          completeGroup: ({ group, payload }) =>
            groups
              .complete({
                params: { ...project, id: group },
                payload,
                responseMode: "decoded-and-response"
              })
              .pipe(Effect.map(([, response]) => sent(response)))
        })
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
      HttpApiClient.group(LocalApi, {
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
    const groups = HttpApiClient.group(LocalApi, {
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

const Hint = Schema.fromJsonString(
  Schema.Struct({ user: Schema.String, view: Schema.NullOr(LastView) })
)

const hintText = () => {
  try {
    return decodeURIComponent(self.location.hash.slice(1))
  } catch {
    return ""
  }
}

const hint = Option.getOrNull(Schema.decodeUnknownOption(Hint)(hintText()))

const workerScope = Scope.makeUnsafe()

const opened = new Map<
  string,
  Fiber.Fiber<
    Context.Context<Layer.Success<ReturnType<typeof localDatabaseLayer>>>,
    Layer.Error<ReturnType<typeof localDatabaseLayer>>
  >
>()

const database = (userId: string) => {
  const existing = opened.get(userId)
  if (existing !== undefined) return existing
  const opening = Effect.runFork(
    Layer.buildWithScope(localDatabaseLayer(userId), workerScope)
  )
  opened.set(userId, opening)
  return opening
}

const prefetch = (userId: string, view: LastView) =>
  Effect.runFork(
    Fiber.join(database(userId)).pipe(
      Effect.flatMap((context) =>
        prefetchView(view).pipe(Effect.provideContext(context))
      ),
      Effect.orElseSucceed(() => null)
    )
  )

const warm =
  hint === null || hint.view === null ? null : prefetch(hint.user, hint.view)

const engine = Layer.unwrap(
  Effect.map(RpcWorker.initialMessage(LocalWorkerInit), ({ userId, timings }) =>
    localRpcsLayer.pipe(
      Layer.provide(syncSourceLayer),
      Layer.provide(pendingWritesLayer),
      Layer.provide(
        localDescriptionsLayer.pipe(Layer.provide(descriptionSourceLayer))
      ),
      Layer.provide(Layer.effectContext(Fiber.join(database(userId)))),
      Layer.provide(
        Layer.effect(WarmView)(
          warm !== null && hint?.user === userId
            ? Fiber.join(warm)
            : Effect.succeed(null)
        )
      ),
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
