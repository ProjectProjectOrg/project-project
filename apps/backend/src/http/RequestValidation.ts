import {
  InvalidRequest,
  type InvalidRequestPart,
  RequestValidation
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { type HttpApiError, HttpApiMiddleware } from "effect/http-api"

const requestParts = {
  Params: "params",
  Query: "query",
  Payload: "payload",
  Headers: "headers"
} satisfies Record<
  Exclude<HttpApiError.HttpApiSchemaError["kind"], "Body" | "ResponseHeaders">,
  InvalidRequestPart
>

export const RequestValidationLive =
  HttpApiMiddleware.layerSchemaErrorTransform(RequestValidation, (error) =>
    error.kind === "Body" || error.kind === "ResponseHeaders"
      ? Effect.fail(error)
      : Effect.fail(
          new InvalidRequest({
            part: requestParts[error.kind],
            message: error.cause.message
          })
        )
  )
