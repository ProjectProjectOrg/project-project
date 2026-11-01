import type { UpdateWebhookInput, WebhookHeader } from "@pp/shared"
import * as Schema from "effect/Schema"

import {
  filledHeaders,
  HeaderRows
} from "@/features/webhooks/lib/webhookEvents"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type ReplaceHeadersValues = Readonly<{
  headers: ReadonlyArray<WebhookHeader>
}>

const ReplaceHeadersSchema = Schema.Struct({ headers: HeaderRows })

export const toReplaceHeadersInput = (
  values: ReplaceHeadersValues
): UpdateWebhookInput => ({ headers: filledHeaders(values.headers) })

export const replaceHeadersFormOpts = (names: ReadonlyArray<string>) => {
  const defaultValues: ReplaceHeadersValues = {
    headers: names.map((name) => ({ name, value: "" }))
  }
  return appFormOptions({
    defaultValues,
    validators: [
      validateAfterSubmit(Schema.toStandardSchemaV1(ReplaceHeadersSchema))
    ]
  })
}
