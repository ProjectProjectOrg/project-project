import {
  cliOAuthClient,
  cliRelease,
  ToolFailure,
  toolInputVersions,
  Tools
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"

import { ToolsAuthMiddlewareLive } from "../Layers/ToolsAuth"
import { ToolHandlersLive } from "./handlers"
import { invokeTool, isToolName, type ToolkitHandlers } from "./invokeTool"

const failure = (status: number, error: string, message: string) =>
  HttpServerResponse.jsonUnsafe(new ToolFailure({ error, message }), {
    status
  })

const toolRoute = (toolkit: ToolkitHandlers) =>
  Effect.gen(function* () {
    const { name } = yield* HttpRouter.params
    if (name === undefined || !isToolName(name)) {
      return failure(404, "NotFound", `Unknown tool: ${name ?? ""}.`)
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const callerVersion = request.headers[cliRelease.toolVersionHeader]
    if (
      callerVersion !== undefined &&
      callerVersion !== toolInputVersions[name]
    ) {
      return failure(
        409,
        "CatalogMismatch",
        `This pp sends ${name} a different input (${callerVersion}) than this server expects (${toolInputVersions[name]}). Run \`pp upgrade\` to get the matching version.`
      )
    }
    const body = yield* request.json
    const result = yield* invokeTool(toolkit, name, body)
    return HttpServerResponse.jsonUnsafe(result.encoded, {
      status: result.isFailure ? 422 : 200
    })
  }).pipe(
    Effect.catchTags({
      ToolInputInvalid: (error) =>
        Effect.succeed(
          failure(400, "Validation", `Validation error: ${error.message}`)
        ),
      HttpServerError: () =>
        Effect.succeed(
          failure(400, "Validation", "The request body must be JSON.")
        )
    })
  )

export const ToolsRouteLive = Layer.unwrap(
  Effect.map(Tools, (toolkit) =>
    HttpRouter.add(
      "POST",
      `${cliOAuthClient.resourcePath}/:name`,
      toolRoute(toolkit)
    )
  )
).pipe(Layer.provide([ToolHandlersLive, ToolsAuthMiddlewareLive]))
