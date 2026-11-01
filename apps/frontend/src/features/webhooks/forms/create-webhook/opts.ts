import {
  ProjectEventKind,
  type CreateWebhookInput,
  type WebhookHeader
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { filledHeaders } from "@/features/webhooks/lib/webhookEvents"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type CreateWebhookValues = Readonly<{
  url: string
  events: ReadonlyArray<ProjectEventKind>
  headers: ReadonlyArray<WebhookHeader>
}>

const CreateWebhookFormSchema = Schema.Struct({
  url: Schema.String.check(Schema.makeFilter((url) => url.trim().length > 0)),
  events: Schema.Array(ProjectEventKind).check(Schema.isMinLength(1)),
  headers: Schema.Array(
    Schema.Struct({ name: Schema.String, value: Schema.String })
  )
})

export const toCreateWebhookInput = (
  values: CreateWebhookValues
): CreateWebhookInput => {
  const headers = filledHeaders(values.headers)
  const input: CreateWebhookInput = {
    url: values.url.trim(),
    events: values.events
  }
  return headers.length > 0 ? { ...input, headers } : input
}

const defaultValues: CreateWebhookValues = {
  url: "",
  events: ["ticket_created", "ticket_status_changed"],
  headers: []
}

export const createWebhookFormOpts = appFormOptions({
  defaultValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(CreateWebhookFormSchema))
  ]
})
