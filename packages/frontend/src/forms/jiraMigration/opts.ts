import * as Schema from "effect/Schema"
import { createValidator, type ReactFormType } from "@tanstack/react-form"
import { appFormOptions } from "@/lib/form"
import {
  JiraMigrationConfiguration,
  StatusSlug,
  TagName,
  TicketPriority,
  TicketType,
  type JiraMigrationRequirements,
  type JiraMigrationConfiguration as JiraMigrationConfigurationType
} from "@projectproject/shared"

export interface JiraMigrationDraft {
  destination: { name: string; slug: string; key: string }
  identities: ReadonlyArray<{
    jiraAccountId: string
    projectProjectUserId: string | null | undefined
  }>
  statuses: ReadonlyArray<{
    jiraStatusId: string
    projectStatusSlug: string | undefined
    createStatus?: true
  }>
  issueTypes: ReadonlyArray<{
    jiraIssueTypeId: string
    projectType: TicketType | undefined
  }>
  priorities: ReadonlyArray<{
    jiraPriorityId: string
    projectPriority: TicketPriority | undefined
  }>
  tags: ReadonlyArray<{
    source: { kind: "label" | "component"; value: string }
    destinationTagName: string
  }>
  activeFutureSprintChoices: ReadonlyArray<{
    jiraIssueId: string
    jiraSprintId: string | null | undefined
  }>
  restrictedContent:
    | { policy: "exclude" }
    | { policy: "include"; disclosureAccepted: true }
  skippedAttachmentIds: ReadonlyArray<string>
  attachmentSkipsAccepted: boolean
}

const emptyDraft: JiraMigrationDraft = {
  destination: { name: "", slug: "", key: "" },
  identities: [],
  statuses: [],
  issueTypes: [],
  priorities: [],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: [],
  attachmentSkipsAccepted: false
}

const allResolved = <S extends Schema.Top>(
  item: S,
  resolved: (value: S["Type"]) => boolean
) =>
  Schema.Array(item).pipe(
    Schema.check(Schema.makeFilter((items) => items.every(resolved)))
  )

const peopleSchema = allResolved(
  Schema.Struct({
    jiraAccountId: Schema.NonEmptyString,
    projectProjectUserId: Schema.NullOr(
      Schema.UndefinedOr(Schema.NonEmptyString)
    )
  }),
  (item) => item.projectProjectUserId !== undefined
)

const statusesSchema = allResolved(
  Schema.Struct({
    jiraStatusId: Schema.NonEmptyString,
    projectStatusSlug: Schema.UndefinedOr(StatusSlug),
    createStatus: Schema.optional(Schema.Literal(true))
  }),
  (item) => item.projectStatusSlug !== undefined
)

const issueTypesSchema = allResolved(
  Schema.Struct({
    jiraIssueTypeId: Schema.NonEmptyString,
    projectType: Schema.UndefinedOr(TicketType)
  }),
  (item) => item.projectType !== undefined
)

const prioritiesSchema = allResolved(
  Schema.Struct({
    jiraPriorityId: Schema.NonEmptyString,
    projectPriority: Schema.UndefinedOr(TicketPriority)
  }),
  (item) => item.projectPriority !== undefined
)

const tagsSchema = Schema.Array(
  Schema.Struct({
    source: Schema.Struct({
      kind: Schema.Literals(["label", "component"]),
      value: Schema.NonEmptyString
    }),
    destinationTagName: TagName
  })
)

const sprintChoicesSchema = allResolved(
  Schema.Struct({
    jiraIssueId: Schema.NonEmptyString,
    jiraSprintId: Schema.NullOr(Schema.UndefinedOr(Schema.NonEmptyString))
  }),
  (item) => item.jiraSprintId !== undefined
)

const jiraMigrationDraftSchema = Schema.Struct({
  destination: JiraMigrationConfiguration.fields.destination,
  identities: peopleSchema,
  statuses: statusesSchema,
  issueTypes: issueTypesSchema,
  priorities: prioritiesSchema,
  tags: tagsSchema,
  activeFutureSprintChoices: sprintChoicesSchema,
  restrictedContent: JiraMigrationConfiguration.fields.restrictedContent,
  skippedAttachmentIds: JiraMigrationConfiguration.fields.skippedAttachmentIds,
  attachmentSkipsAccepted:
    JiraMigrationConfiguration.fields.attachmentSkipsAccepted
})

export const jiraMigrationFormOpts = appFormOptions({
  defaultValues: emptyDraft,
  validators: [
    {
      run: Schema.toStandardSchemaV1(jiraMigrationDraftSchema),
      triggers: []
    }
  ]
})

export type JiraMigrationForm = ReactFormType<typeof jiraMigrationFormOpts>

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

export const peopleValidator = Schema.toStandardSchemaV1(peopleSchema)

export const statusesValidator = Schema.toStandardSchemaV1(statusesSchema)

export const issueTypesValidator = Schema.toStandardSchemaV1(issueTypesSchema)

export const prioritiesValidator = Schema.toStandardSchemaV1(prioritiesSchema)

export const tagsValidator = Schema.toStandardSchemaV1(tagsSchema)

export const destinationValidator = Schema.toStandardSchemaV1(
  JiraMigrationConfiguration.fields.destination
)

const sourceKey = (source: { kind: string; value: string }) =>
  `${source.kind}:${source.value}`

const exactIssueTypeNames = new Map<string, TicketType>([
  ["feat", "feat"],
  ["feature", "feat"],
  ["bug", "bug"],
  ["chore", "chore"],
  ["other", "other"]
])

const exactIssueType = (name: string): TicketType | undefined =>
  exactIssueTypeNames.get(name.trim().toLowerCase())

export function buildJiraMigrationDraft(
  requirements: JiraMigrationRequirements,
  configuration: JiraMigrationConfigurationType | null
): JiraMigrationDraft {
  const identities = new Map(
    configuration?.identities.map((item) => [
      item.jiraAccountId,
      item.projectProjectUserId
    ])
  )
  const statuses = new Map(
    configuration?.statuses.map((item) => [item.jiraStatusId, item])
  )
  const issueTypes = new Map(
    configuration?.issueTypes.map((item) => [
      item.jiraIssueTypeId,
      item.projectType
    ])
  )
  const priorities = new Map(
    configuration?.priorities.map((item) => [
      item.jiraPriorityId,
      item.projectPriority
    ])
  )
  const tags = new Map(
    configuration?.tags.map((item) => [
      sourceKey(item.source),
      item.destinationTagName
    ])
  )
  const sprints = new Map(
    configuration?.activeFutureSprintChoices.map((item) => [
      item.jiraIssueId,
      item.jiraSprintId
    ])
  )
  const forcedSkips = requirements.attachments
    .filter((attachment) => attachment.forcedSkipReason !== null)
    .map((attachment) => attachment.jiraAttachmentId)

  return {
    destination: configuration?.destination ?? {
      name: requirements.destination.suggestedName,
      slug: requirements.destination.suggestedSlug,
      key: requirements.destination.suggestedKey
    },
    identities: requirements.identities.map((identity) => ({
      jiraAccountId: identity.jiraAccountId,
      projectProjectUserId: identities.has(identity.jiraAccountId)
        ? identities.get(identity.jiraAccountId)
        : undefined
    })),
    statuses: requirements.statuses.map((status) => {
      const configured = statuses.get(status.jiraStatusId)
      return {
        jiraStatusId: status.jiraStatusId,
        projectStatusSlug: configured?.projectStatusSlug,
        createStatus: configured?.createStatus
      }
    }),
    issueTypes: requirements.issueTypes.map((issueType) => ({
      jiraIssueTypeId: issueType.jiraIssueTypeId,
      projectType: issueTypes.has(issueType.jiraIssueTypeId)
        ? issueTypes.get(issueType.jiraIssueTypeId)
        : exactIssueType(issueType.name)
    })),
    priorities: requirements.priorities.map((priority) => ({
      jiraPriorityId: priority.jiraPriorityId,
      projectPriority: priorities.has(priority.jiraPriorityId)
        ? priorities.get(priority.jiraPriorityId)
        : (priority.suggestedProjectPriority ?? undefined)
    })),
    tags: requirements.tags.map((tag) => ({
      source: tag.source,
      destinationTagName:
        tags.get(sourceKey(tag.source)) ?? tag.suggestedDestinationTagName ?? ""
    })),
    activeFutureSprintChoices: requirements.activeFutureSprintChoices.map(
      (choice) => ({
        jiraIssueId: choice.jiraIssueId,
        jiraSprintId: sprints.has(choice.jiraIssueId)
          ? sprints.get(choice.jiraIssueId)
          : undefined
      })
    ),
    restrictedContent: configuration?.restrictedContent ?? {
      policy: "exclude"
    },
    skippedAttachmentIds: [
      ...new Set([
        ...forcedSkips,
        ...(configuration?.skippedAttachmentIds ?? [])
      ])
    ],
    attachmentSkipsAccepted: configuration?.attachmentSkipsAccepted ?? false
  }
}

export function toPartialJiraMigrationConfiguration(
  draft: JiraMigrationDraft
): JiraMigrationConfigurationType {
  return Schema.decodeUnknownSync(JiraMigrationConfiguration)({
    ...draft,
    identities: draft.identities.filter(
      (item) => item.projectProjectUserId !== undefined
    ),
    statuses: draft.statuses.filter(
      (item) => item.projectStatusSlug !== undefined
    ),
    issueTypes: draft.issueTypes.filter(
      (item) => item.projectType !== undefined
    ),
    priorities: draft.priorities.filter(
      (item) => item.projectPriority !== undefined
    ),
    tags: draft.tags.filter((item) => item.destinationTagName.length > 0),
    activeFutureSprintChoices: draft.activeFutureSprintChoices.filter(
      (item) => item.jiraSprintId !== undefined
    )
  })
}
