import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"
import { m } from "@/paraglide/messages"

export type JiraSourceValues = Readonly<{
  cloudId: string
  projectId: string
}>

const sourceIssue = (values: JiraSourceValues) => {
  if (values.cloudId === "")
    return { path: ["cloudId"], issue: m.jira_import_source_site_required() }
  if (values.projectId === "")
    return {
      path: ["projectId"],
      issue: m.jira_import_source_project_required()
    }
  return undefined
}

const JiraSourceSchema = Schema.Struct({
  cloudId: Schema.String,
  projectId: Schema.String
}).check(Schema.makeFilter(sourceIssue))

export const jiraSourceFormOpts = (cloudId: string) =>
  appFormOptions({
    defaultValues: { cloudId, projectId: "" } satisfies JiraSourceValues,
    validators: [
      validateAfterSubmit(Schema.toStandardSchemaV1(JiraSourceSchema))
    ]
  })
