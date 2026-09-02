import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { Attachments } from "../Services/Attachments"

export const AttachmentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "attachments",
  (handlers) =>
    handlers
      .handle("prepare", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.prepare(
            path.orgSlug,
            path.slug,
            path.id,
            user.id,
            payload
          )
        })
      )
      .handle("commit", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.commit(
            path.orgSlug,
            path.slug,
            path.id,
            user.id,
            path.attachmentId
          )
        })
      )
)
