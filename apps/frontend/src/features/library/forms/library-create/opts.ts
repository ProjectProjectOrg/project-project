import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import type { LibraryLayer } from "@/features/library/atoms/libraryScope"
import {
  keyFromName,
  keyProblem,
  type KeyProblem,
  type LibraryKind
} from "@/features/library/lib/libraryModel"
import { appFormOptions } from "@/lib/form"
import { m } from "@/paraglide/messages"

export type LibraryCreateValues = Readonly<{
  example: string | null
  name: string
  key: string | null
  layer: LibraryLayer
}>

export const effectiveLibraryKey = (
  values: Pick<LibraryCreateValues, "name" | "key">
): string => values.key ?? keyFromName(values.name.trim())

const KEY_PROBLEM_MESSAGES: Readonly<Record<KeyProblem, () => string>> = {
  invalid: () => m.templates_settings_key_invalid(),
  reserved: () => m.templates_settings_key_reserved(),
  taken: () => m.templates_error_key_taken()
}

const libraryCreateSchema = (
  kind: LibraryKind,
  taken: (layer: LibraryLayer) => ReadonlySet<string>
) =>
  Schema.Struct({
    example: Schema.NullOr(Schema.String),
    name: Schema.String,
    key: Schema.NullOr(Schema.String),
    layer: Schema.Literals(["org", "project"])
  }).check(
    Schema.makeFilter((values) => {
      if (values.name.trim() === "")
        return { path: ["name"], issue: m.validation_required() }
      const problem = keyProblem(
        effectiveLibraryKey(values),
        kind,
        taken(values.layer)
      )
      return problem === null
        ? undefined
        : { path: ["key"], issue: KEY_PROBLEM_MESSAGES[problem]() }
    })
  )

const afterSubmitOrKeyed = ({
  formApi
}: Readonly<{
  formApi: Readonly<{
    state: Readonly<{
      submissionAttempts: number
      values: LibraryCreateValues
    }>
  }>
}>) => formApi.state.submissionAttempts > 0 || formApi.state.values.key !== null

const validateOnceKeyed = createValidator({
  triggers: [
    { trigger: "change", when: afterSubmitOrKeyed },
    { trigger: "blur", when: afterSubmitOrKeyed }
  ]
})

const defaultValuesFor = (layer: LibraryLayer): LibraryCreateValues => ({
  example: null,
  name: "",
  key: null,
  layer
})

export const libraryCreateFormOpts = (
  kind: LibraryKind,
  layer: LibraryLayer,
  taken: (layer: LibraryLayer) => ReadonlySet<string>
) =>
  appFormOptions({
    defaultValues: defaultValuesFor(layer),
    validators: [
      validateOnceKeyed(
        Schema.toStandardSchemaV1(libraryCreateSchema(kind, taken))
      )
    ]
  })
