import { Attachments } from "@pp/server-core/attachments/Attachments"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const AttachmentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "attachments",
  (handlers) =>
    handlers
      .handle("prepareProject", ({ payload }) =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.prepare(null, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("commitProject", ({ params }) =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.commit(null, params.attachmentId)
        ).pipe(dieOnMarkdown)
      )
      .handle("prepare", ({ params, payload }) =>
        Effect.flatMap(Attachments, (attachments) =>
          attachments.prepare(params.id, payload)
        ).pipe(dieOnMarkdown)
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
        Effect.flatMap(Attachments, (attachments) =>
          attachments.commit(params.id, params.attachmentId)
        ).pipe(dieOnMarkdown)
      )
)
