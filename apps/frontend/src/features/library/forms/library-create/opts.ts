import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import {
  keyFromName,
  keyProblem,
  type KeyProblem,
  type LibraryKind
} from "@/features/library/lib/libraryModel"
import { appFormOptions } from "@/lib/form"
import { m } from "@/paraglide/messages"

export type LibraryCreateValues = Readonly<{
  name: string
  key: string | null
}>

export const effectiveLibraryKey = (values: LibraryCreateValues): string =>
  values.key ?? keyFromName(values.name.trim())

const KEY_PROBLEM_MESSAGES: Readonly<Record<KeyProblem, () => string>> = {
  invalid: () => m.templates_settings_key_invalid(),
  reserved: () => m.templates_settings_key_reserved(),
  taken: () => m.templates_error_key_taken()
}

const libraryCreateSchema = (kind: LibraryKind, taken: ReadonlySet<string>) =>
  Schema.Struct({
    name: Schema.String,
    key: Schema.NullOr(Schema.String)
  }).check(
    Schema.makeFilter((values) => {
      const problem = keyProblem(effectiveLibraryKey(values), kind, taken)
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

const defaultValues: LibraryCreateValues = { name: "", key: null }

export const libraryCreateFormOpts = (
  kind: LibraryKind,
  taken: ReadonlySet<string>
) =>
  appFormOptions({
    defaultValues,
    validators: [
      validateOnceKeyed(
        Schema.toStandardSchemaV1(libraryCreateSchema(kind, taken))
      )
    ]
  })
