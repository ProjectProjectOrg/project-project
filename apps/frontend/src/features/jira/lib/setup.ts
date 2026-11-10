import type { JiraMigrationRequirements } from "@pp/shared"

import {
  destinationIssues,
  isPendingInvite,
  isValidTagName,
  sameNameStatus,
  type JiraImportSetup,
  type SprintChoice,
  type StatusChoice,
  type TagChoice
} from "./draft"
import type { PeopleChoice } from "./people"

export const jiraSetupSections = [
  "people",
  "statuses",
  "types",
  "priorities",
  "tags",
  "sprints",
  "destination"
] as const

export type JiraSetupSection = (typeof jiraSetupSections)[number]

export const jiraSetupSectionId = (section: JiraSetupSection): string =>
  `jira-setup-section-${section}`

export type JiraSetupCounts = Readonly<{
  people: Readonly<{
    total: number
    linked: number
    invited: number
    unlinked: number
    attention: number
  }>
  statuses: Readonly<{
    total: number
    targets: number
    created: number
    attention: number
  }>
  types: Readonly<{ total: number; attention: number }>
  priorities: Readonly<{ total: number; attention: number }>
  tags: Readonly<{
    total: number
    merged: number
    skipped: number
    attention: number
  }>
  sprints: Readonly<{ total: number; attention: number }>
  destination: Readonly<{ attention: number }>
}>

export const personNeedsAttention = (choice: PeopleChoice): boolean =>
  choice.projectProjectUserId === undefined || isPendingInvite(choice)

export const statusNeedsAttention = (choice: StatusChoice): boolean =>
  choice.projectStatusSlug === undefined

export const tagNeedsAttention = (
  choice: TagChoice,
  requirement: JiraMigrationRequirements["tags"][number] | undefined
): boolean => {
  if (choice.skipped === true) return false
  if (choice.destinationTagName !== "")
    return !isValidTagName(choice.destinationTagName)
  return (requirement?.suggestedDestinationTagName ?? null) === null
}

export const sprintNeedsAttention = (choice: SprintChoice): boolean =>
  choice.jiraSprintId === undefined

const count = <A>(
  items: ReadonlyArray<A>,
  predicate: (item: A) => boolean
): number => items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0)

export function jiraSetupCounts(
  setup: JiraImportSetup,
  requirements: JiraMigrationRequirements,
  destinationConflicts: number
): JiraSetupCounts {
  const destination = destinationIssues(setup.destination)
  return {
    people: {
      total: setup.identities.length,
      linked: count(
        setup.identities,
        (item) =>
          item.projectProjectUserId !== null &&
          item.projectProjectUserId !== undefined
      ),
      invited: count(
        setup.identities,
        (item) =>
          item.projectProjectUserId === null &&
          item.inviteEmail !== undefined &&
          !isPendingInvite(item)
      ),
      unlinked: count(
        setup.identities,
        (item) =>
          item.projectProjectUserId === null && item.inviteEmail === undefined
      ),
      attention: count(setup.identities, personNeedsAttention)
    },
    statuses: {
      total: setup.statuses.length,
      targets: new Set(
        setup.statuses.flatMap((item) =>
          item.projectStatusSlug === undefined ? [] : [item.projectStatusSlug]
        )
      ).size,
      created: count(setup.statuses, (item) => item.createStatus === true),
      attention: count(setup.statuses, statusNeedsAttention)
    },
    types: {
      total: setup.issueTypes.length,
      attention: count(
        setup.issueTypes,
        (item) => item.projectType === undefined
      )
    },
    priorities: {
      total: setup.priorities.length,
      attention: count(
        setup.priorities,
        (item) => item.projectPriority === undefined
      )
    },
    tags: {
      total: setup.tags.length,
      merged: count(
        requirements.tags,
        (tag) => tag.collisionSourceValues.length > 0
      ),
      skipped: count(setup.tags, (tag) => tag.skipped === true),
      attention: setup.tags.reduce(
        (total, tag, index) =>
          total + (tagNeedsAttention(tag, requirements.tags[index]) ? 1 : 0),
        0
      )
    },
    sprints: {
      total: setup.activeFutureSprintChoices.length,
      attention: count(setup.activeFutureSprintChoices, sprintNeedsAttention)
    },
    destination: {
      attention:
        (destination.name ? 1 : 0) +
        (destination.slug ? 1 : 0) +
        (destination.key ? 1 : 0) +
        destinationConflicts
    }
  }
}

export const sectionAttention = (
  counts: JiraSetupCounts,
  section: JiraSetupSection
): number => counts[section].attention

const sectionRowCount: Readonly<
  Record<JiraSetupSection, (requirements: JiraMigrationRequirements) => number>
> = {
  people: (requirements) => requirements.identities.length,
  statuses: (requirements) => requirements.statuses.length,
  types: (requirements) => requirements.issueTypes.length,
  priorities: (requirements) => requirements.priorities.length,
  tags: (requirements) => requirements.tags.length,
  sprints: (requirements) => requirements.activeFutureSprintChoices.length,
  destination: () => 1
}

export const visibleSetupSections = (
  requirements: JiraMigrationRequirements
): ReadonlyArray<JiraSetupSection> =>
  jiraSetupSections.filter(
    (section) => sectionRowCount[section](requirements) > 0
  )

export const firstSectionNeedingAttention = (
  counts: JiraSetupCounts,
  sections: ReadonlyArray<JiraSetupSection>
): JiraSetupSection | undefined =>
  sections.find((section) => sectionAttention(counts, section) > 0)

export const setupNeedsAttention = (
  counts: JiraSetupCounts,
  sections: ReadonlyArray<JiraSetupSection>
): boolean => firstSectionNeedingAttention(counts, sections) !== undefined

export type RowFilter = Readonly<{
  query: string
  attentionOnly: boolean
}>

export function filterRowIndexes(
  count: number,
  filter: RowFilter,
  text: (index: number) => ReadonlyArray<string | null | undefined>,
  needsAttention: (index: number) => boolean
): ReadonlyArray<number> {
  const words = filter.query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const indexes: Array<number> = []
  for (let index = 0; index < count; index++) {
    if (filter.attentionOnly && !needsAttention(index)) continue
    if (words.length > 0) {
      const haystack = text(index)
        .filter(
          (value): value is string => value !== null && value !== undefined
        )
        .join(" ")
        .toLowerCase()
      if (!words.every((word) => haystack.includes(word))) continue
    }
    indexes.push(index)
  }
  return indexes
}

export const linkAllSuggested = (
  identities: ReadonlyArray<PeopleChoice>,
  requirements: JiraMigrationRequirements
): ReadonlyArray<PeopleChoice> =>
  identities.map((choice, index) => {
    const suggestion =
      requirements.identities[index]?.suggestedProjectProjectUserId
    if (
      suggestion === null ||
      suggestion === undefined ||
      !requirements.identityOptions.some((option) => option.id === suggestion)
    )
      return choice
    return {
      jiraAccountId: choice.jiraAccountId,
      projectProjectUserId: suggestion
    }
  })

export const inviteEveryoneWithEmail = (
  identities: ReadonlyArray<PeopleChoice>,
  requirements: JiraMigrationRequirements
): ReadonlyArray<PeopleChoice> =>
  identities.map((choice, index) => {
    const email = requirements.identities[index]?.email ?? null
    if (
      email === null ||
      (choice.projectProjectUserId !== null &&
        choice.projectProjectUserId !== undefined) ||
      (choice.inviteEmail !== undefined && !isPendingInvite(choice))
    )
      return choice
    return {
      jiraAccountId: choice.jiraAccountId,
      projectProjectUserId: null,
      inviteEmail: email
    }
  })

export const leaveRestUnlinked = (
  identities: ReadonlyArray<PeopleChoice>
): ReadonlyArray<PeopleChoice> =>
  identities.map((choice) =>
    personNeedsAttention(choice)
      ? { jiraAccountId: choice.jiraAccountId, projectProjectUserId: null }
      : choice
  )

const jiraStatusToKeep = (
  choice: StatusChoice,
  status: JiraMigrationRequirements["statuses"][number] | undefined,
  requirements: JiraMigrationRequirements
) =>
  status !== undefined &&
  status.createOption !== null &&
  choice.createStatus !== true &&
  sameNameStatus(status.name, requirements.statusOptions) === undefined
    ? status.createOption
    : null

export const keepJiraStatuses = (
  statuses: ReadonlyArray<StatusChoice>,
  requirements: JiraMigrationRequirements
): ReadonlyArray<StatusChoice> =>
  statuses.map((choice, index) => {
    const option = jiraStatusToKeep(
      choice,
      requirements.statuses[index],
      requirements
    )
    return option === null
      ? choice
      : {
          jiraStatusId: choice.jiraStatusId,
          projectStatusSlug: option.slug,
          createStatus: true
        }
  })

export const jiraStatusesToKeep = (
  statuses: ReadonlyArray<StatusChoice>,
  requirements: JiraMigrationRequirements
): number =>
  count(
    statuses.map((choice, index) =>
      jiraStatusToKeep(choice, requirements.statuses[index], requirements)
    ),
    (option) => option !== null
  )

export const keepAllTagNames = (
  tags: ReadonlyArray<TagChoice>,
  requirements: JiraMigrationRequirements
): ReadonlyArray<TagChoice> =>
  tags.map((choice, index) => {
    const destinationTagName =
      requirements.tags[index]?.suggestedDestinationTagName ?? ""
    return choice.skipped === true
      ? { source: choice.source, destinationTagName, skipped: true }
      : { source: choice.source, destinationTagName }
  })

export const setTagSkipped = (
  choice: TagChoice,
  skipped: boolean
): TagChoice =>
  skipped
    ? {
        source: choice.source,
        destinationTagName: choice.destinationTagName,
        skipped: true
      }
    : { source: choice.source, destinationTagName: choice.destinationTagName }

export const rareLabelIndexes = (
  tags: ReadonlyArray<TagChoice>,
  requirements: JiraMigrationRequirements
): ReadonlyArray<number> =>
  tags.flatMap((choice, index) => {
    const usage = requirements.tags[index]?.issueCount
    return choice.skipped !== true &&
      choice.source.kind === "label" &&
      usage !== undefined &&
      usage <= 1
      ? [index]
      : []
  })

export const skipTags = (
  tags: ReadonlyArray<TagChoice>,
  indexes: ReadonlyArray<number>
): ReadonlyArray<TagChoice> =>
  tags.map((choice, index) =>
    indexes.includes(index) ? setTagSkipped(choice, true) : choice
  )

export const byImpact = (
  indexes: ReadonlyArray<number>,
  impact: (index: number) => number | undefined
): ReadonlyArray<number> =>
  indexes.toSorted((a, b) => (impact(b) ?? 0) - (impact(a) ?? 0))

export const moveAllToBacklog = (
  choices: ReadonlyArray<SprintChoice>
): ReadonlyArray<SprintChoice> =>
  choices.map((choice) =>
    sprintNeedsAttention(choice)
      ? { jiraIssueId: choice.jiraIssueId, jiraSprintId: null }
      : choice
  )
