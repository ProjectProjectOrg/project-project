import * as Schema from "effect/Schema"

import { jiraSetupSections } from "./setup"
import { jiraImportSteps } from "./stages"

export const JiraImportSearch = Schema.Struct({
  step: Schema.optional(Schema.Literals(jiraImportSteps)),
  section: Schema.optional(Schema.Literals(jiraSetupSections)),
  reconfigure: Schema.optional(Schema.Literal("true"))
})

export type JiraImportSearch = typeof JiraImportSearch.Type
