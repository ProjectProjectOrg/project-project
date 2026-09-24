import { Attachments } from "@pp/server-core/attachments/Attachments"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const AttachmentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "attachments",
  (handlers) =>
    handlers
      .handle("prepareProject", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.prepare(
            params.orgSlug,
            params.slug,
            null,
            user.id,
            payload
          )
        })
      )
      .handle("commitProject", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.commit(
            params.orgSlug,
            params.slug,
            null,
            user.id,
            params.attachmentId
          )
        })
      )
      .handle("prepare", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.prepare(
            params.orgSlug,
            params.slug,
            params.id,
            user.id,
            payload
          )
        })
      )
      .handle("list", ({ query }) =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.listForOrg(query)
        )
      )
      .handle("summary", () =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.summarizeForOrg()
        )
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.deleteForOrg(params.attachmentId)
        )
      )
      .handle("commit", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.commit(
            params.orgSlug,
            params.slug,
            params.id,
            user.id,
            params.attachmentId
          )
        })
      )
)
