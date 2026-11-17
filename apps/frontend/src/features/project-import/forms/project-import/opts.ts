import {
  CreatableProjectKey,
  type ProjectImport,
  RunProjectImportInput
} from "@pp/shared"
import { type ReactFormType } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import { deriveKey } from "@/features/projects/lib/deriveKey"
import { appFormOptions } from "@/lib/form"

const { people: peopleSchema, ...destinationFields } =
  RunProjectImportInput.fields

const destinationSchema = Schema.Struct(destinationFields)

const projectImportSchema = Schema.Struct({
  destination: destinationSchema,
  people: peopleSchema
})

export type ProjectImportValues = typeof projectImportSchema.Encoded

const isCreatableKey = Schema.is(CreatableProjectKey)

export const defaultProjectImportValues = (
  imported: ProjectImport
): ProjectImportValues => {
  const name = imported.source?.name ?? ""
  const sourceKey = imported.source?.key ?? ""
  return {
    destination: {
      name,
      slug: imported.source?.slug ?? "",
      key: isCreatableKey(sourceKey) ? sourceKey : deriveKey(name)
    },
    people: imported.people.map((person) => ({
      sourceUserId: person.id,
      userId: person.suggestedUserId
    }))
  }
}

const decodeRunInput = Schema.decodeSync(RunProjectImportInput)

export const toRunProjectImportInput = (
  values: ProjectImportValues
): RunProjectImportInput =>
  decodeRunInput({ ...values.destination, people: values.people })

export const destinationValidator = Schema.toStandardSchemaV1(destinationSchema)

const emptyValues: ProjectImportValues = {
  destination: { name: "", slug: "", key: "" },
  people: []
}

export const projectImportFormOpts = appFormOptions({
  defaultValues: emptyValues,
  validators: [
    { run: Schema.toStandardSchemaV1(projectImportSchema), triggers: [] }
  ]
})

export type ProjectImportForm = ReactFormType<typeof projectImportFormOpts>
