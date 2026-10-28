import {
  STATUS_DESCRIPTION_MAX_LENGTH,
  StatusIcon,
  type StatusIconName
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type StatusEditorValues = Readonly<{
  label: string
  icon: StatusIconName
  color: string
  description: string
}>

const StatusEditorSchema = Schema.Struct({
  label: Schema.String.check(
    Schema.makeFilter((label) => label.trim().length > 0)
  ),
  icon: StatusIcon,
  color: Schema.String,
  description: Schema.String.check(
    Schema.isMaxLength(STATUS_DESCRIPTION_MAX_LENGTH)
  )
})

export const statusEditorFormOpts = (defaultValues: StatusEditorValues) =>
  appFormOptions({
    defaultValues,
    validators: [
      validateAfterSubmit(Schema.toStandardSchemaV1(StatusEditorSchema))
    ]
  })
