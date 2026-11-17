import * as ProjectImports from "@pp/server-core/projects/ProjectImports"
import { AppApi, ProjectImport, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

const encodeImport = Schema.encodeSync(ProjectImport)

export const ProjectImportsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projectImports",
  (handlers) =>
    handlers
      .handleRaw("upload", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const imports = yield* ProjectImports.ProjectImports
          const imported = yield* imports.upload(
            request.stream.pipe(
              Stream.mapError(
                () => new Validation({ reason: "upload_interrupted" })
              )
            )
          )
          return HttpServerResponse.jsonUnsafe(encodeImport(imported), {
            headers: { "cache-control": "no-store" }
          })
        })
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(ProjectImports.ProjectImports, (imports) =>
          imports.get(params.importId)
        )
      )
      .handle("run", ({ params, payload }) =>
        Effect.flatMap(ProjectImports.ProjectImports, (imports) =>
          imports.run(params.importId, payload)
        )
      )
      .handle("cancel", ({ params }) =>
        Effect.flatMap(ProjectImports.ProjectImports, (imports) =>
          imports.cancel(params.importId)
        )
      )
)
