import * as Schema from "effect/Schema"

import type { LibraryLayer } from "@/features/library/atoms/libraryScope"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type SaveAsTemplateValues = Readonly<{
  name: string
  layer: LibraryLayer
  includePriority: boolean
  includeTags: boolean
}>

const SaveAsTemplateFormSchema = Schema.Struct({
  name: Schema.String.check(
    Schema.makeFilter((name) => name.trim().length > 0)
  ),
  layer: Schema.Literals(["project", "org"]),
  includePriority: Schema.Boolean,
  includeTags: Schema.Boolean
})

const defaultValues: SaveAsTemplateValues = {
  name: "",
  layer: "project",
  includePriority: false,
  includeTags: false
}

export const saveAsTemplateFormOpts = appFormOptions({
  defaultValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(SaveAsTemplateFormSchema))
  ]
})
