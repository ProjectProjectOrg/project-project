import {
  FigmaAuthInvalid,
  FigmaError,
  FigmaFileNotFound,
  FigmaRateLimited
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"

import {
  Figma,
  figmaAuthHeader,
  figmaImageScale,
  type FigmaCallError,
  type FigmaCredential,
  type FigmaFileSummary,
  type FigmaShape
} from "./Figma"

const baseUrl = "https://api.figma.com"

const Fetch = FetchHttpClient.Fetch as Context.Key<
  never,
  typeof globalThis.fetch
>

const ExternalId = Schema.Union([Schema.String, Schema.Finite])
const NullableString = Schema.NullOr(Schema.String).pipe(
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const ErrorPayload = Schema.Struct({
  message: Schema.optional(Schema.String),
  err: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String)
})
const UserResponse = Schema.Struct({
  id: ExternalId,
  handle: NullableString,
  email: NullableString
})
const FileResponse = Schema.Struct({
  name: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  lastModified: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  thumbnailUrl: NullableString
})
const DevResource = Schema.Struct({
  id: ExternalId,
  url: Schema.String
})
const DevResourcesResponse = Schema.Struct({
  dev_resources: Schema.Array(DevResource).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  )
})
const NodeResponse = Schema.Struct({
  document: Schema.Struct({ name: Schema.String })
})
const NodesResponse = Schema.Struct({
  nodes: Schema.Record(Schema.String, Schema.NullOr(NodeResponse))
})
const ImagesResponse = Schema.Struct({
  images: Schema.Record(Schema.String, Schema.NullOr(Schema.String))
})
const DevResourceMutationResponse = Schema.Struct({
  errors: Schema.Array(Schema.Struct({ error: Schema.String })).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  links_created: Schema.Array(Schema.Struct({ id: ExternalId })).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  )
})

const errorMessage = (payload: unknown): string => {
  const decoded = Schema.decodeUnknownOption(ErrorPayload)(payload)
  if (Option.isNone(decoded)) return "Figma error"
  return (
    decoded.value.message ??
    decoded.value.err ??
    decoded.value.error ??
    "Figma error"
  )
}

const parseRetryAfterSeconds = (response: Response): number => {
  const header = response.headers.get("Retry-After")
  const parsed = header === null ? Number.NaN : Number(header)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60
}

const errorForStatus = (
  response: Response,
  fileKey: string | null,
  message: string
): FigmaCallError => {
  if (response.status === 401 || response.status === 403) {
    return new FigmaAuthInvalid()
  }
  if (response.status === 429) {
    return new FigmaRateLimited({
      retryAfterSeconds: parseRetryAfterSeconds(response)
    })
  }
  if (response.status === 404 && fileKey !== null) {
    return new FigmaFileNotFound({ fileKey })
  }
  return new FigmaError({ reason: message })
}

const send = (
  credential: FigmaCredential,
  method: string,
  path: string,
  body: unknown
) =>
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...figmaAuthHeader(credential)
          },
          body: body === undefined ? undefined : Response.json(body).body
        }),
      catch: (cause) => new FigmaError({ reason: String(cause) })
    })
    const payload =
      response.status === 204
        ? null
        : yield* Effect.promise(() => response.json().catch(() => null))
    return { response, payload }
  })

const request = <S extends Schema.ConstraintDecoder<unknown>>(
  credential: FigmaCredential,
  method: string,
  path: string,
  body: unknown,
  fileKey: string | null,
  schema: S
): Effect.Effect<S["Type"], FigmaCallError> =>
  send(credential, method, path, body).pipe(
    Effect.flatMap(({ response, payload }) =>
      response.ok
        ? Schema.decodeUnknownEffect(schema)(payload).pipe(
            Effect.mapError(
              (cause) => new FigmaError({ reason: String(cause) })
            )
          )
        : Effect.fail(errorForStatus(response, fileKey, errorMessage(payload)))
    )
  )

const fetchBytes = (url: string): Effect.Effect<Uint8Array, FigmaCallError> =>
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (cause) => new FigmaError({ reason: String(cause) })
    })
    if (!response.ok) {
      return yield* new FigmaError({
        reason: `unexpected status ${response.status}`
      })
    }
    const buffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) => new FigmaError({ reason: String(cause) })
    })
    return new Uint8Array(buffer)
  })

const getFile = (
  credential: FigmaCredential,
  fileKey: string
): Effect.Effect<FigmaFileSummary, FigmaCallError> =>
  request(
    credential,
    "GET",
    `/v1/files/${encodeURIComponent(fileKey)}?depth=1`,
    undefined,
    fileKey,
    FileResponse
  )

const findExistingDevResourceId = (
  credential: FigmaCredential,
  fileKey: string,
  nodeId: string,
  url: string
): Effect.Effect<string | null> =>
  request(
    credential,
    "GET",
    `/v1/files/${encodeURIComponent(fileKey)}/dev_resources?node_ids=${encodeURIComponent(nodeId)}`,
    undefined,
    fileKey,
    DevResourcesResponse
  ).pipe(
    Effect.map((payload) => {
      const match = payload.dev_resources.find(
        (resource) => resource.url === url
      )
      return match === undefined ? null : String(match.id)
    }),
    Effect.catch(() => Effect.succeed(null))
  )

export const FigmaLive = Layer.effect(
  Figma,
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const withFetch = <A, E>(
      effect: Effect.Effect<A, E>
    ): Effect.Effect<A, E> => effect.pipe(Effect.provideService(Fetch, fetch))

    return {
      getMe: (credential) =>
        withFetch(
          request(
            credential,
            "GET",
            "/v1/me",
            undefined,
            null,
            UserResponse
          ).pipe(
            Effect.map((user) => ({
              id: String(user.id),
              handle: user.handle,
              email: user.email
            }))
          )
        ),

      getFile: (credential, fileKey) => withFetch(getFile(credential, fileKey)),

      getNodeName: (credential, fileKey, nodeId) =>
        withFetch(
          request(
            credential,
            "GET",
            `/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}`,
            undefined,
            fileKey,
            NodesResponse
          ).pipe(
            Effect.flatMap((payload) => {
              const node = payload.nodes[nodeId]
              return node == null
                ? Effect.fail(new FigmaFileNotFound({ fileKey }))
                : Effect.succeed({ name: node.document.name })
            })
          )
        ),

      renderNode: (credential, fileKey, nodeId, scale) =>
        withFetch(
          Effect.gen(function* () {
            if (nodeId === null) {
              const file = yield* getFile(credential, fileKey)
              if (file.thumbnailUrl === null) {
                return yield* new FigmaError({ reason: "node_not_renderable" })
              }
              return yield* fetchBytes(file.thumbnailUrl)
            }
            const clampedScale = figmaImageScale(scale)
            const payload = yield* request(
              credential,
              "GET",
              `/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${clampedScale}`,
              undefined,
              fileKey,
              ImagesResponse
            )
            const imageUrl = payload.images[nodeId]
            if (imageUrl == null) {
              return yield* new FigmaError({ reason: "node_not_renderable" })
            }
            return yield* fetchBytes(imageUrl)
          })
        ),

      createDevResource: (credential, input) =>
        withFetch(
          send(credential, "POST", "/v1/dev_resources", {
            dev_resources: [
              {
                name: input.name,
                url: input.url,
                file_key: input.fileKey,
                node_id: input.nodeId
              }
            ]
          }).pipe(
            Effect.flatMap(({ response, payload }) => {
              if (!response.ok) {
                return Effect.fail(
                  errorForStatus(response, null, errorMessage(payload))
                )
              }
              return Schema.decodeUnknownEffect(DevResourceMutationResponse)(
                payload
              ).pipe(
                Effect.mapError(
                  (cause) => new FigmaError({ reason: String(cause) })
                ),
                Effect.flatMap((decoded) => {
                  const firstError = decoded.errors[0]
                  if (firstError !== undefined) {
                    return findExistingDevResourceId(
                      credential,
                      input.fileKey,
                      input.nodeId,
                      input.url
                    ).pipe(
                      Effect.flatMap((existingId) =>
                        existingId !== null
                          ? Effect.succeed(existingId)
                          : Effect.logDebug(
                              "Figma dev resource create skipped by the API"
                            ).pipe(
                              Effect.annotateLogs({ reason: firstError.error }),
                              Effect.as(null)
                            )
                      )
                    )
                  }
                  const created = decoded.links_created[0]
                  return Effect.succeed(
                    created === undefined ? null : String(created.id)
                  )
                })
              )
            })
          )
        ),

      deleteDevResource: (credential, fileKey, devResourceId) =>
        withFetch(
          send(
            credential,
            "DELETE",
            `/v1/files/${encodeURIComponent(fileKey)}/dev_resources/${encodeURIComponent(devResourceId)}`,
            undefined
          ).pipe(
            Effect.flatMap(({ response, payload }) =>
              response.ok || response.status === 404
                ? Effect.void
                : Effect.fail(
                    errorForStatus(response, null, errorMessage(payload))
                  )
            )
          )
        )
    } satisfies FigmaShape
  })
)
