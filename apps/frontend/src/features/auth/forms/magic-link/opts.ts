import { InviteEmail } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export const magicLinkFormOpts = appFormOptions({
  defaultValues: { email: "" },
  validators: [
    validateAfterSubmit(
      Schema.toStandardSchemaV1(Schema.Struct({ email: InviteEmail }))
    )
  ]
})
