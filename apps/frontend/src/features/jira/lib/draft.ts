import {
  CreatableProjectKey,
  EmailAddress,
  JiraMigrationConfiguration,
  Slug,
  StatusSlug,
  TagName,
  type JiraMigrationConfiguration as JiraMigrationConfigurationType,
  type JiraMigrationRequirements,
  type TicketPriority,
  type TicketType
} from "@pp/shared"
import * as Schema from "effect/Schema"

import type { PeopleChoice } from "./people"

export type StatusChoice = Readonly<{
  jiraStatusId: string
  projectStatusSlug: string | undefined
  createStatus?: true
}>

export type IssueTypeChoice = Readonly<{
  jiraIssueTypeId: string
  projectType: TicketType | undefined
}>

export type PriorityChoice = Readonly<{
  jiraPriorityId: string
  projectPriority: TicketPriority | undefined
}>

export type TagChoice = Readonly<{
  source: Readonly<{ kind: "label" | "component"; value: string }>
  destinationTagName: string
  skipped?: true
}>

export type SprintChoice = Readonly<{
  jiraIssueId: string
  jiraSprintId: string | null | undefined
}>

export type DestinationChoice = Readonly<{
  name: string
  slug: string
  key: string
}>

export type RestrictedContentChoice =
  | Readonly<{ policy: "exclude" }>
  | Readonly<{ policy: "include"; disclosureAccepted: true }>

export type JiraImportSetup = Readonly<{
  identities: ReadonlyArray<PeopleChoice>
  statuses: ReadonlyArray<StatusChoice>
  issueTypes: ReadonlyArray<IssueTypeChoice>
  priorities: ReadonlyArray<PriorityChoice>
  tags: ReadonlyArray<TagChoice>
  activeFutureSprintChoices: ReadonlyArray<SprintChoice>
  destination: DestinationChoice
}>

export type JiraImportReview = Readonly<{
  restrictedContent: RestrictedContentChoice
  skippedAttachmentIds: ReadonlyArray<string>
}>

export type JiraImportDraft = Readonly<{
  setup: JiraImportSetup
  review: JiraImportReview
}>

export const emptyJiraImportDraft: JiraImportDraft = {
  setup: {
    identities: [],
    statuses: [],
    issueTypes: [],
    priorities: [],
    tags: [],
    activeFutureSprintChoices: [],
    destination: { name: "", slug: "", key: "" }
  },
  review: {
    restrictedContent: { policy: "exclude" },
    skippedAttachmentIds: []
  }
}

const isEmailAddress = Schema.is(EmailAddress)
const isTagName = Schema.is(TagName)
const isStatusSlug = Schema.is(StatusSlug)
const isSlug = Schema.is(Slug)
const isProjectKey = Schema.is(CreatableProjectKey)
const isConfiguration = Schema.is(JiraMigrationConfiguration)

export const isValidTagName = (name: string): boolean => isTagName(name)

export const isPendingInvite = (choice: PeopleChoice): boolean =>
  choice.inviteEmail !== undefined && !isEmailAddress(choice.inviteEmail.trim())

export type DestinationIssues = Readonly<{
  name: boolean
  slug: boolean
  key: boolean
}>

export const destinationIssues = (
  destination: DestinationChoice
): DestinationIssues => ({
  name: destination.name.trim().length === 0,
  slug: !isSlug(destination.slug),
  key: !isProjectKey(destination.key)
})

const normalized = (value: string) => value.trim().toLowerCase()

const nativeTypeNames = new Map<string, TicketType>([
  ["feat", "feat"],
  ["feature", "feat"],
  ["bug", "bug"],
  ["chore", "chore"],
  ["other", "other"],
  ["epic", "epic"]
])

const matchIssueType = (name: string): TicketType | undefined =>
  nativeTypeNames.get(normalized(name))

export const sameNameStatus = (
  jiraName: string,
  options: JiraMigrationRequirements["statusOptions"]
): JiraMigrationRequirements["statusOptions"][number] | undefined => {
  const name = normalized(jiraName)
  return options.find(
    (option) =>
      normalized(option.label) === name ||
      normalized(option.slug.replaceAll("_", " ")) === name ||
      normalized(option.slug) === name
  )
}

const matchStatus = (
  status: JiraMigrationRequirements["statuses"][number],
  options: JiraMigrationRequirements["statusOptions"]
): string | undefined => {
  const byName = sameNameStatus(status.name, options)
  if (byName !== undefined) return byName.slug
  return status.suggestedProjectStatusSlug !== null &&
    options.some((option) => option.slug === status.suggestedProjectStatusSlug)
    ? status.suggestedProjectStatusSlug
    : undefined
}

const suggestedPerson = (
  identity: JiraMigrationRequirements["identities"][number],
  options: JiraMigrationRequirements["identityOptions"]
): string | null =>
  identity.suggestedProjectProjectUserId !== null &&
  options.some((option) => option.id === identity.suggestedProjectProjectUserId)
    ? identity.suggestedProjectProjectUserId
    : null

const slugPart = (value: string, allowed: RegExp, length: number) =>
  value
    .toLowerCase()
    .replace(allowed, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .slice(0, length)

export const fallbackTagName = (source: TagChoice["source"]): string => {
  if (source.kind === "component") {
    const part = slugPart(source.value, /[^a-z0-9-]+/gu, 21)
    return `component:${part === "" ? "tag" : part}`
  }
  const part = slugPart(source.value, /[^a-z0-9 -]+/gu, 31)
  return part === "" ? "tag" : part
}

const sourceKey = (source: TagChoice["source"]) =>
  `${source.kind}:${source.value}`

export const hasRestrictedContent = (
  requirements: JiraMigrationRequirements
): boolean =>
  requirements.restrictedContent.issueCount > 0 ||
  requirements.restrictedContent.commentCount > 0 ||
  requirements.restrictedContent.worklogCount > 0

export function buildJiraImportDraft(
  requirements: JiraMigrationRequirements,
  configuration: JiraMigrationConfigurationType | null
): JiraImportDraft {
  const identities = new Map(
    configuration?.identities.map((item) => [item.jiraAccountId, item])
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
    configuration?.tags.map((item) => [sourceKey(item.source), item])
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
    setup: {
      identities: requirements.identities.map((identity) => {
        const configured = identities.get(identity.jiraAccountId)
        if (configured === undefined)
          return {
            jiraAccountId: identity.jiraAccountId,
            projectProjectUserId: suggestedPerson(
              identity,
              requirements.identityOptions
            )
          }
        if (configured.inviteEmail === undefined)
          return {
            jiraAccountId: identity.jiraAccountId,
            projectProjectUserId: configured.projectProjectUserId
          }
        return {
          jiraAccountId: identity.jiraAccountId,
          projectProjectUserId: configured.projectProjectUserId,
          inviteEmail: configured.inviteEmail
        }
      }),
      statuses: requirements.statuses.map((status) => {
        const configured = statuses.get(status.jiraStatusId)
        if (configured !== undefined)
          return configured.createStatus === true
            ? {
                jiraStatusId: status.jiraStatusId,
                projectStatusSlug: configured.projectStatusSlug,
                createStatus: true
              }
            : {
                jiraStatusId: status.jiraStatusId,
                projectStatusSlug: configured.projectStatusSlug
              }
        return {
          jiraStatusId: status.jiraStatusId,
          projectStatusSlug: matchStatus(status, requirements.statusOptions)
        }
      }),
      issueTypes: requirements.issueTypes.map((issueType) => ({
        jiraIssueTypeId: issueType.jiraIssueTypeId,
        projectType:
          issueTypes.get(issueType.jiraIssueTypeId) ??
          issueType.suggestedProjectType ??
          matchIssueType(issueType.name)
      })),
      priorities: requirements.priorities.map((priority) => ({
        jiraPriorityId: priority.jiraPriorityId,
        projectPriority:
          priorities.get(priority.jiraPriorityId) ??
          priority.suggestedProjectPriority ??
          undefined
      })),
      tags: requirements.tags.map((tag) => {
        const configured = tags.get(sourceKey(tag.source))
        const destinationTagName =
          configured?.destinationTagName ??
          tag.suggestedDestinationTagName ??
          ""
        return configured?.skipped === true
          ? { source: tag.source, destinationTagName, skipped: true }
          : { source: tag.source, destinationTagName }
      }),
      activeFutureSprintChoices: requirements.activeFutureSprintChoices.map(
        (choice) => ({
          jiraIssueId: choice.jiraIssueId,
          jiraSprintId: sprints.has(choice.jiraIssueId)
            ? sprints.get(choice.jiraIssueId)
            : undefined
        })
      ),
      destination: configuration?.destination ?? {
        name: requirements.destination.suggestedName,
        slug: requirements.destination.suggestedSlug,
        key: requirements.destination.suggestedKey
      }
    },
    review: {
      restrictedContent: configuration?.restrictedContent ?? {
        policy: "exclude"
      },
      skippedAttachmentIds: [
        ...new Set([
          ...forcedSkips,
          ...(configuration?.skippedAttachmentIds ?? [])
        ])
      ]
    }
  }
}

export function toJiraImportConfiguration(
  draft: JiraImportDraft
): JiraMigrationConfigurationType | null {
  const { setup, review } = draft
  const issues = destinationIssues(setup.destination)
  if (issues.name || issues.slug || issues.key) return null
  const candidate = {
    destination: {
      name: setup.destination.name.trim(),
      slug: setup.destination.slug,
      key: setup.destination.key
    },
    identities: setup.identities.flatMap((item) => {
      if (item.projectProjectUserId === undefined || isPendingInvite(item))
        return []
      return item.inviteEmail === undefined
        ? [
            {
              jiraAccountId: item.jiraAccountId,
              projectProjectUserId: item.projectProjectUserId
            }
          ]
        : [
            {
              jiraAccountId: item.jiraAccountId,
              projectProjectUserId: null,
              inviteEmail: item.inviteEmail.trim()
            }
          ]
    }),
    statuses: setup.statuses.flatMap((item) =>
      item.projectStatusSlug === undefined ||
      !isStatusSlug(item.projectStatusSlug)
        ? []
        : [
            item.createStatus === true
              ? {
                  jiraStatusId: item.jiraStatusId,
                  projectStatusSlug: item.projectStatusSlug,
                  createStatus: true as const
                }
              : {
                  jiraStatusId: item.jiraStatusId,
                  projectStatusSlug: item.projectStatusSlug
                }
          ]
    ),
    issueTypes: setup.issueTypes.flatMap((item) =>
      item.projectType === undefined
        ? []
        : [
            {
              jiraIssueTypeId: item.jiraIssueTypeId,
              projectType: item.projectType
            }
          ]
    ),
    priorities: setup.priorities.flatMap((item) =>
      item.projectPriority === undefined
        ? []
        : [
            {
              jiraPriorityId: item.jiraPriorityId,
              projectPriority: item.projectPriority
            }
          ]
    ),
    tags: setup.tags.flatMap((item): ReadonlyArray<TagChoice> => {
      if (item.skipped === true)
        return [
          {
            source: item.source,
            destinationTagName: isTagName(item.destinationTagName)
              ? item.destinationTagName
              : fallbackTagName(item.source),
            skipped: true as const
          }
        ]
      return isTagName(item.destinationTagName)
        ? [{ source: item.source, destinationTagName: item.destinationTagName }]
        : []
    }),
    activeFutureSprintChoices: setup.activeFutureSprintChoices.filter(
      (item) => item.jiraSprintId !== undefined
    ),
    restrictedContent: review.restrictedContent,
    skippedAttachmentIds: review.skippedAttachmentIds,
    attachmentSkipsAccepted: review.skippedAttachmentIds.length > 0
  }
  return isConfiguration(candidate) ? candidate : null
}

const sameConfiguration = Schema.toEquivalence(JiraMigrationConfiguration)

export const configurationBehind = (
  draft: JiraImportDraft,
  saved: JiraMigrationConfigurationType | null
): boolean => {
  const current = toJiraImportConfiguration(draft)
  return (
    current !== null && (saved === null || !sameConfiguration(current, saved))
  )
}
