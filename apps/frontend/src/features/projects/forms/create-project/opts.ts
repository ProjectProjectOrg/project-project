import { CreateProjectInput } from "@pp/shared"
import * as Schema from "effect/Schema"

import { deriveKey } from "@/features/projects/lib/deriveKey"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"
import { m } from "@/paraglide/messages"

export type CreateProjectValues = Readonly<{
  name: string
  key: string | null
}>

export const effectiveProjectKey = (values: CreateProjectValues): string =>
  values.key ?? deriveKey(values.name.trim())

const decodeCreateProjectInput = Schema.decodeSync(CreateProjectInput)

export const toCreateProjectInput = (
  values: CreateProjectValues
): CreateProjectInput =>
  decodeCreateProjectInput({
    name: values.name.trim(),
    key: effectiveProjectKey(values)
  })

const isCreatableKey = Schema.is(CreateProjectInput.fields.key)

const CreateProjectFormSchema = Schema.Struct({
  name: Schema.String,
  key: Schema.NullOr(Schema.String)
}).check(
  Schema.makeFilter((values) =>
    isCreatableKey(effectiveProjectKey(values))
      ? undefined
      : { path: ["key"], issue: m.projects_create_key_invalid() }
  )
)

const defaultValues: CreateProjectValues = { name: "", key: null }

export const createProjectFormOpts = appFormOptions({
  defaultValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(CreateProjectFormSchema))
  ]
})
