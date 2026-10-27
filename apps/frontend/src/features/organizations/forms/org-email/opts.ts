import { SaveOrgEmailInput } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions } from "@/lib/form"

const defaultValues: SaveOrgEmailInput = {
  host: "",
  port: 587,
  security: "starttls",
  username: "",
  password: undefined,
  senderName: "",
  senderEmail: "",
  replyTo: null
}

export const emailFormOpts = appFormOptions({
  defaultValues,
  validators: [
    { run: Schema.toStandardSchemaV1(SaveOrgEmailInput), triggers: [] }
  ]
})
