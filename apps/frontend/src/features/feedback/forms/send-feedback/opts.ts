import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

import { emptyFeedbackValues } from "../../atoms/feedbackDraft"

const SendFeedbackFormSchema = Schema.Struct({
  kind: Schema.Literals(["bug", "feature"]),
  title: Schema.String.check(
    Schema.makeFilter((title) => title.trim().length > 0)
  ),
  description: Schema.String
})

export const sendFeedbackFormOpts = appFormOptions({
  defaultValues: emptyFeedbackValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(SendFeedbackFormSchema))
  ]
})
