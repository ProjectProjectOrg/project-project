import * as Schema from "effect/Schema"

import {
  defaultSprintRange,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type CreateSprintValues = Readonly<{
  name: string
  range: SprintDateDraft
}>

const CreateSprintFormSchema = Schema.Struct({
  name: Schema.String.check(
    Schema.makeFilter((name) => name.trim().length > 0)
  ),
  range: Schema.Struct({ from: Schema.Date, to: Schema.Date })
})

export const createSprintFormOpts = () => {
  const defaultValues: CreateSprintValues = {
    name: "",
    range: defaultSprintRange()
  }
  return appFormOptions({
    defaultValues,
    validators: [
      validateAfterSubmit(Schema.toStandardSchemaV1(CreateSprintFormSchema))
    ]
  })
}
