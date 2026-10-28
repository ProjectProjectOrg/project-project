import type { FeedbackKind } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type SendFeedbackValues = Readonly<{
  kind: FeedbackKind
  title: string
  description: string
}>

const SendFeedbackFormSchema = Schema.Struct({
  kind: Schema.Literals(["bug", "feature"]),
  title: Schema.String.check(
    Schema.makeFilter((title) => title.trim().length > 0)
  ),
  description: Schema.String
})

const defaultValues: SendFeedbackValues = {
  kind: "bug",
  title: "",
  description: ""
}

export const sendFeedbackFormOpts = appFormOptions({
  defaultValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(SendFeedbackFormSchema))
  ]
})
