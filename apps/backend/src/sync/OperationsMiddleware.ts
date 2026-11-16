// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import type { CommandOutcome } from "@pp/db/schema"
import { SyncOperation } from "@pp/server-core/sync/ChangeOrigin"
import * as CommandReceipts from "@pp/server-core/sync/CommandReceipts"
import {
  Conflict,
  CurrentUser,
  OPERATION_ID_HEADER,
  Operations,
  SYNC_RECEIPT_HEADER,
  Validation
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"

const OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/u

const hashOf = (request: HttpServerRequest.HttpServerRequest, body: string) =>
  createHash("sha256")
    .update(`${request.method} ${request.url}\n${body}`)
    .digest("hex")

const isJsonOrEmpty = (request: HttpServerRequest.HttpServerRequest) => {
  const contentType = request.headers["content-type"]
  return contentType === undefined || contentType.includes("application/json")
}

const responseOutcome = (
  response: HttpServerResponse.HttpServerResponse
): CommandOutcome | null =>
  Match.value(response.body).pipe(
    Match.tags({
      Empty: (): CommandOutcome => ({
        status: response.status,
        contentType: null,
        body: ""
      }),
      Uint8Array: (body): CommandOutcome => ({
        status: response.status,
        contentType: body.contentType,
        body: new TextDecoder().decode(body.body)
      })
    }),
    Match.orElse(() => null)
  )

const isStored = (status: number) =>
  status < 500 && status !== 401 && status !== 403

const withReceipt = (
  response: HttpServerResponse.HttpServerResponse,
  receipt: string
) =>
  receipt === ""
    ? response
    : HttpServerResponse.setHeader(response, SYNC_RECEIPT_HEADER, receipt)

const replay = (outcome: CommandOutcome, receipt: string) =>
  withReceipt(
    outcome.contentType === null
      ? HttpServerResponse.empty({ status: outcome.status })
      : HttpServerResponse.text(outcome.body, {
          status: outcome.status,
          contentType: outcome.contentType
        }),
    receipt
  )

export const OperationsLive = Layer.effect(
  Operations,
  Effect.gen(function* () {
    const receipts = yield* CommandReceipts.CommandReceipts

    return Operations.of(
      Effect.fn("Operations")(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest
        const operationId = request.headers[OPERATION_ID_HEADER]
        if (
          operationId === undefined ||
          request.method === "GET" ||
          !isJsonOrEmpty(request)
        )
          return yield* httpEffect
        if (!OPERATION_ID.test(operationId))
          return yield* new Validation({ reason: "operation_id_invalid" })

        const user = yield* CurrentUser
        const key = { userId: user.id, operationId }
        const body = yield* request.text.pipe(Effect.orElseSucceed(() => ""))
        const claim = yield* receipts.claim(key, hashOf(request, body))
        if (claim.kind === "mismatch")
          return yield* new Conflict({ reason: "operation_mismatch" })
        if (claim.kind === "pending")
          return yield* new Conflict({ reason: "operation_pending" })
        if (claim.kind === "done") return replay(claim.outcome, claim.receipt)

        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.gen(function* () {
            const outcome = responseOutcome(response)
            if (outcome === null || !isStored(outcome.status)) {
              yield* receipts.release(key)
              return response
            }
            return withReceipt(response, yield* receipts.complete(key, outcome))
          })
        )
        return yield* Effect.provideService(
          httpEffect,
          SyncOperation,
          operationId
        )
      }, Effect.uninterruptible)
    )
  })
)
