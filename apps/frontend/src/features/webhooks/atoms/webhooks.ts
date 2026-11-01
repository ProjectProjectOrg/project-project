import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookDelivery
} from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"

type ProjectParams = Readonly<{ orgSlug: string; slug: string }>

export type WebhooksRequest = Readonly<{
  _view: "webhooks"
  params: ProjectParams
}>

export type WebhookDeliveriesRequest = Readonly<{
  _view: "webhookDeliveries"
  params: ProjectParams & Readonly<{ webhookId: string }>
}>

export const webhooksRequest = (
  orgSlug: string,
  slug: string
): WebhooksRequest => ({ _view: "webhooks", params: { orgSlug, slug } })

export const webhookDeliveriesRequest = (
  orgSlug: string,
  slug: string,
  webhookId: string
): WebhookDeliveriesRequest => ({
  _view: "webhookDeliveries",
  params: { orgSlug, slug, webhookId }
})

const scopeOf = (params: ProjectParams) =>
  projectScope(params.orgSlug, params.slug)

export const webhooksFor = Atom.family((req: WebhooksRequest) =>
  Atom.optimistic(
    query("webhooks", "list", {
      params: req.params,
      timeToLive: "30 seconds",
      reactivityKeys: [Keys.webhooks(scopeOf(req.params))]
    })
  )
)

export const webhookDeliveries = Atom.family((req: WebhookDeliveriesRequest) =>
  Atom.optimistic(
    query("webhooks", "deliveries", {
      params: req.params,
      timeToLive: "30 seconds",
      reactivityKeys: [
        Keys.webhookDeliveries(scopeOf(req.params), req.params.webhookId)
      ]
    })
  )
)

const replaceWebhook = (
  webhooks: ReadonlyArray<Webhook>,
  next: Webhook
): ReadonlyArray<Webhook> =>
  webhooks.map((webhook) => (webhook.id === next.id ? next : webhook))

const patchWebhook = (
  webhooks: ReadonlyArray<Webhook>,
  id: string,
  patch: Partial<Webhook>
): ReadonlyArray<Webhook> =>
  webhooks.map((webhook) =>
    webhook.id === id ? { ...webhook, ...patch } : webhook
  )

const deliveriesChanged = (req: WebhooksRequest, id: string) => [
  Keys.webhookDeliveries(scopeOf(req.params), id)
]

export const createWebhook = Atom.family((req: WebhooksRequest) =>
  viewMutation(webhooksFor(req), {
    name: "createWebhook",
    predict: (webhooks, _input: CreateWebhookInput) => webhooks,
    call: (api, input) =>
      api.webhooks.create({ params: req.params, payload: input }),
    confirm: (webhooks, created) => [...webhooks, created.webhook]
  })
)

type WebhookTarget = Readonly<{ req: WebhooksRequest; id: string }>

export const updateWebhook = Atom.family(({ req, id }: WebhookTarget) =>
  viewMutation(webhooksFor(req), {
    name: "updateWebhook",
    predict: (webhooks, input: UpdateWebhookInput) =>
      input.events === undefined
        ? webhooks
        : patchWebhook(webhooks, id, { events: input.events }),
    call: (api, input) =>
      api.webhooks.update({
        params: { ...req.params, webhookId: id },
        payload: input
      }),
    confirm: replaceWebhook
  })
)

export const setWebhookEnabled = Atom.family(({ req, id }: WebhookTarget) =>
  viewMutation(webhooksFor(req), {
    name: "setWebhookEnabled",
    predict: (webhooks, enabled: boolean) =>
      patchWebhook(webhooks, id, {
        status: enabled ? "active" : "disabled",
        disabledReason: enabled ? null : "manual"
      }),
    call: (api, enabled) =>
      enabled
        ? api.webhooks.enable({ params: { ...req.params, webhookId: id } })
        : api.webhooks.disable({ params: { ...req.params, webhookId: id } }),
    confirm: replaceWebhook,
    publish: () => deliveriesChanged(req, id)
  })
)

export const rotateWebhookSecret = Atom.family(({ req, id }: WebhookTarget) =>
  viewMutation(webhooksFor(req), {
    name: "rotateWebhookSecret",
    predict: (webhooks, _input: void) => webhooks,
    call: (api) =>
      api.webhooks.rotateSecret({ params: { ...req.params, webhookId: id } }),
    confirm: (webhooks, rotated) => replaceWebhook(webhooks, rotated.webhook)
  })
)

export const deleteWebhook = Atom.family(({ req, id }: WebhookTarget) =>
  viewMutation(webhooksFor(req), {
    name: "deleteWebhook",
    predict: (webhooks, _input: void) =>
      webhooks.filter((webhook) => webhook.id !== id),
    call: (api) =>
      api.webhooks.delete({ params: { ...req.params, webhookId: id } }),
    confirm: (webhooks) => webhooks.filter((webhook) => webhook.id !== id)
  })
)

const upsertDelivery = (
  deliveries: ReadonlyArray<WebhookDelivery>,
  delivery: WebhookDelivery
): ReadonlyArray<WebhookDelivery> =>
  deliveries.some((item) => item.id === delivery.id)
    ? deliveries.map((item) => (item.id === delivery.id ? delivery : item))
    : [delivery, ...deliveries]

export const sendWebhookTest = Atom.family((req: WebhookDeliveriesRequest) =>
  viewMutation(webhookDeliveries(req), {
    name: "sendWebhookTest",
    predict: (deliveries, _input: void) => deliveries,
    call: (api) => api.webhooks.test({ params: req.params }),
    confirm: upsertDelivery
  })
)

export const retryWebhookDelivery = Atom.family(
  ({
    req,
    deliveryId
  }: Readonly<{ req: WebhookDeliveriesRequest; deliveryId: string }>) =>
    viewMutation(webhookDeliveries(req), {
      name: "retryWebhookDelivery",
      predict: (deliveries, _input: void) =>
        deliveries.map((delivery) =>
          delivery.id === deliveryId
            ? { ...delivery, state: "pending" as const, finishedAt: null }
            : delivery
        ),
      call: (api) =>
        api.webhooks.retryDelivery({ params: { ...req.params, deliveryId } }),
      confirm: upsertDelivery,
      publish: () => [Keys.webhooks(scopeOf(req.params))]
    })
)
