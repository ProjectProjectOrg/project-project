import { FeedbackAttachments } from "@pp/server-core/feedback/FeedbackAttachments"
import { FeedbackConfig } from "@pp/server-core/feedback/FeedbackConfig"
import { FeedbackDelivery } from "@pp/server-core/feedback/FeedbackDelivery"
import { FeedbackIntake } from "@pp/server-core/feedback/FeedbackIntake"
import { AppApi, CurrentUser } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import * as Option from "effect/Option"

const USER_AGENT_MAX = 1000

export const FeedbackHandlerLive = HttpApiBuilder.group(
  AppApi,
  "feedback",
  (handlers) =>
    handlers
      .handle("status", ({ params }) =>
        Effect.gen(function* () {
          const config = yield* FeedbackConfig
          if (Option.isNone(config.targetUrl)) {
            return { enabled: false, attachments: false }
          }
          const attachments = yield* FeedbackAttachments
          return {
            enabled: true,
            attachments: yield* attachments.available(params.orgSlug)
          }
        })
      )
      .handle("upload", ({ payload }) =>
        Effect.flatMap(FeedbackAttachments, (attachments) =>
          attachments.upload(payload.file)
        )
      )
      .handle("submit", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const config = yield* FeedbackConfig
          const request = yield* HttpServerRequest.HttpServerRequest
          const delivery = yield* FeedbackDelivery
          const userAgent = request.headers["user-agent"]?.trim()
          yield* delivery.enqueue(
            {
              kind: payload.kind,
              title: payload.title,
              description: payload.description,
              reporter: { name: user.name || user.email, email: user.email },
              instance: {
                url: config.instanceUrl,
                version: Option.getOrNull(config.version)
              },
              context: {
                route: payload.route,
                userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null
              },
              submittedAt: yield* DateTime.nowAsDate
            },
            payload.attachmentIds
          )
        })
      )
)

export const FeedbackIntakeHandlerLive = HttpApiBuilder.group(
  AppApi,
  "feedbackIntake",
  (handlers) =>
    handlers.handle("receive", ({ payload }) =>
      Effect.flatMap(FeedbackIntake, (intake) =>
        intake.receive(payload.report, payload.files)
      )
    )
)
