import { TicketPriority, type JiraMigrationRequirements } from "@pp/shared"
import { createValidator, type ReactFormType } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import { emptyJiraImportDraft } from "@/features/jira/lib/draft"
import {
  jiraSetupCounts,
  setupNeedsAttention,
  visibleSetupSections
} from "@/features/jira/lib/setup"
import { appFormOptions } from "@/lib/form"

const Choices = Schema.Struct({
  identities: Schema.Array(
    Schema.Struct({
      jiraAccountId: Schema.String,
      projectProjectUserId: Schema.UndefinedOr(Schema.NullOr(Schema.String)),
      inviteEmail: Schema.optionalKey(Schema.String)
    })
  ),
  statuses: Schema.Array(
    Schema.Struct({
      jiraStatusId: Schema.String,
      projectStatusSlug: Schema.UndefinedOr(Schema.String),
      createStatus: Schema.optionalKey(Schema.Literal(true))
    })
  ),
  issueTypes: Schema.Array(
    Schema.Struct({
      jiraIssueTypeId: Schema.String,
      projectType: Schema.UndefinedOr(Schema.NullOr(Schema.String))
    })
  ),
  priorities: Schema.Array(
    Schema.Struct({
      jiraPriorityId: Schema.String,
      projectPriority: Schema.UndefinedOr(TicketPriority)
    })
  ),
  tags: Schema.Array(
    Schema.Struct({
      source: Schema.Struct({
        kind: Schema.Literals(["label", "component"]),
        value: Schema.String
      }),
      destinationTagName: Schema.String,
      skipped: Schema.optionalKey(Schema.Literal(true))
    })
  ),
  activeFutureSprintChoices: Schema.Array(
    Schema.Struct({
      jiraIssueId: Schema.String,
      jiraSprintId: Schema.UndefinedOr(Schema.NullOr(Schema.String))
    })
  ),
  destination: Schema.Struct({
    name: Schema.String,
    slug: Schema.String,
    key: Schema.String
  })
})

export const setupSchema = (requirements: JiraMigrationRequirements) =>
  Choices.check(
    Schema.makeFilter(
      (setup) =>
        !setupNeedsAttention(
          jiraSetupCounts(setup, requirements, 0),
          visibleSetupSections(requirements)
        )
    )
  )

export const reviewSchema = Schema.Struct({
  restrictedContent: Schema.Union([
    Schema.Struct({ policy: Schema.Literal("exclude") }),
    Schema.Struct({
      policy: Schema.Literal("include"),
      disclosureAccepted: Schema.Literal(true)
    })
  ]),
  skippedAttachmentIds: Schema.Array(Schema.String)
})

export const jiraImportFormOpts = (requirements: JiraMigrationRequirements) =>
  appFormOptions({
    defaultValues: emptyJiraImportDraft,
    validators: [
      {
        run: Schema.toStandardSchemaV1(
          Schema.Struct({
            setup: setupSchema(requirements),
            review: reviewSchema
          })
        ),
        triggers: []
      }
    ]
  })

export type JiraImportForm = ReactFormType<
  ReturnType<typeof jiraImportFormOpts>
>

export const validateStep = createValidator({
  triggers: [
    {
      trigger: "change",
      when: (context) =>
        context.scope === "group" &&
        context.groupApi.state.submissionAttempts > 0
    }
  ]
})

export const validateDestinationField = createValidator({
  triggers: ["change", "blur"],
  runOnMount: true
})
