import type { UpdateWebhookInput } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type ReplaceUrlValues = Readonly<{ url: string }>

const ReplaceUrlSchema = Schema.Struct({
  url: Schema.String.check(Schema.makeFilter((url) => url.trim().length > 0))
})

export const toReplaceUrlInput = (
  values: ReplaceUrlValues
): UpdateWebhookInput => ({ url: values.url.trim() })

const defaultValues: ReplaceUrlValues = { url: "" }

export const replaceUrlFormOpts = appFormOptions({
  defaultValues,
  validators: [validateAfterSubmit(Schema.toStandardSchemaV1(ReplaceUrlSchema))]
})
