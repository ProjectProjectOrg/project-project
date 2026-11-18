import { HttpApiMiddleware } from "effect/http-api"

import { InvalidRequest } from "../errors"

export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
  "@pp/shared/http/RequestValidation",
  { error: InvalidRequest }
) {}
