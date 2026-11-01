import { AppApi } from "@pp/shared"
import { ProjectWebhooks } from "@pp/webhooks/ProjectWebhooks"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const WebhooksHandlerLive = HttpApiBuilder.group(
  AppApi,
  "webhooks",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(ProjectWebhooks, (webhooks) => webhooks.list())
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) => webhooks.create(payload))
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.update(params.webhookId, payload)
        )
      )
      .handle("delete", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.remove(params.webhookId)
        )
      )
      .handle("rotateSecret", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.rotateSecret(params.webhookId)
        )
      )
      .handle("enable", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.enable(params.webhookId)
        )
      )
      .handle("test", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.test(params.webhookId)
        )
      )
      .handle("deliveries", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.deliveries(params.webhookId)
        )
      )
      .handle("retryDelivery", ({ params }) =>
        Effect.flatMap(ProjectWebhooks, (webhooks) =>
          webhooks.retryDelivery(params.webhookId, params.deliveryId)
        )
      )
)
