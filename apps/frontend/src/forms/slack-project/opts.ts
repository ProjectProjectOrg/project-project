import { SaveSlackProjectInput, SlackEvent } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions } from "@/lib/form"

const defaultValues: SaveSlackProjectInput = {
  channelId: "",
  events: [...SlackEvent.literals]
}

export const slackProjectOpts = appFormOptions({
  defaultValues,
  validators: [
    { run: Schema.toStandardSchemaV1(SaveSlackProjectInput), triggers: [] }
  ]
})
