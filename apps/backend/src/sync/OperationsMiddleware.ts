// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import type { CommandOutcome } from "@pp/db/schema"
import { SyncOperation } from "@pp/server-core/sync/ChangeOrigin"
import * as CommandReceipts from "@pp/server-core/sync/CommandReceipts"
import {
  Conflict,
  CurrentUser,
  Forbidden,
  OPERATION_ID_HEADER,
  Operations,
  SYNC_RECEIPT_HEADER,
  Unauthorized,
  Validation
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { HttpApiEndpoint } from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"

const OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/u

const httpApiStatus = SchemaAST.resolveAt<number>("httpApiStatus")

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
): CommandOutcome | null => {
  const { body } = response
  if (body._tag === "Empty")
    return { status: response.status, contentType: null, body: "" }
  if (body._tag === "Uint8Array")
    return {
      status: response.status,
      contentType: body.contentType,
      body: new TextDecoder().decode(body.body)
    }
  return null
}

const errorOutcome = (
  endpoint: HttpApiEndpoint.Top,
  error: unknown
): CommandOutcome | null => {
  if (Schema.is(Unauthorized)(error) || Schema.is(Forbidden)(error)) return null
  for (const schema of endpoint.error) {
    if (!Schema.is(schema)(error)) continue
    const encoded = Schema.encodeUnknownExit(
      Schema.toCodecJson(schema) as unknown as Schema.Codec<
        unknown,
        Schema.Json
      >
    )(error)
    if (Exit.isFailure(encoded)) return null
    return {
      status: httpApiStatus(schema.ast) ?? 500,
      contentType: "application/json",
      body: JSON.stringify(encoded.value)
    }
  }
  return null
}

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
      Effect.fn("Operations")(function* (httpEffect, { endpoint }) {
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

        const exit = yield* httpEffect.pipe(
          Effect.provideService(SyncOperation, operationId),
          Effect.exit
        )
        const outcome = Exit.isSuccess(exit)
          ? responseOutcome(exit.value)
          : Option.match(Cause.findErrorOption(exit.cause), {
              onNone: () => null,
              onSome: (error) => errorOutcome(endpoint, error)
            })
        if (outcome === null) {
          yield* receipts.release(key)
          return yield* exit
        }
        const receipt = yield* receipts.complete(key, outcome)
        if (Exit.isFailure(exit)) return yield* exit
        return withReceipt(exit.value, receipt)
      }, Effect.uninterruptible)
    )
  })
)
