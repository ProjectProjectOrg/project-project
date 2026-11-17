import {
  AppApi,
  Forbidden,
  ImportFormatUnsupported,
  NotFound,
  PROJECT_IMPORT_MAX_BYTES,
  ProjectImport,
  StorageError,
  StorageNotConnected,
  Unauthorized,
  Validation
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi"
import * as Schema from "effect/Schema"

export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}

const UploadError = Schema.Union([
  Unauthorized,
  NotFound,
  Forbidden,
  Validation,
  ImportFormatUnsupported,
  StorageNotConnected,
  StorageError
])

const decodeImport = Schema.decodeUnknownEffect(ProjectImport)
const decodeUploadError = Schema.decodeUnknownEffect(UploadError)

export const uploadProjectArchive = Effect.fn("Api.uploadProjectArchive")(
  function* ({
    orgSlug,
    file
  }: Readonly<{ orgSlug: string; file: File }>): Effect.fn.Return<
    ProjectImport,
    typeof UploadError.Type
  > {
    if (file.size > PROJECT_IMPORT_MAX_BYTES) {
      return yield* new Validation({ reason: "archive_too_large" })
    }
    const fetch = yield* FetchHttpClient.Fetch
    const response = yield* Effect.promise(() =>
      fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/project-imports`, {
        method: "POST",
        body: file,
        credentials: "same-origin",
        headers: { "content-type": "application/gzip" }
      })
    )
    const body = yield* Effect.promise<unknown>(() => response.json())
    if (!response.ok) {
      return yield* Effect.flip(decodeUploadError(body).pipe(Effect.orDie))
    }
    return yield* decodeImport(body).pipe(Effect.orDie)
  }
)
