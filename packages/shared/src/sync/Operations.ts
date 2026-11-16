import { HttpApiMiddleware } from "effect/http-api"

import type { CurrentUser } from "../auth/Authentication"
import { Conflict, Validation } from "../errors"

export const OPERATION_ID_HEADER = "operation-id"
export const SYNC_RECEIPT_HEADER = "sync-receipt"

export class Operations extends HttpApiMiddleware.Service<
  Operations,
  { requires: CurrentUser }
>()("@pp/shared/sync/Operations", {
  error: [Conflict, Validation]
}) {}
