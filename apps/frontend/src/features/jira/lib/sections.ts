import { m } from "@/paraglide/messages"

import type { JiraImportSetup } from "./draft"
import type { JiraSetupCounts, JiraSetupSection } from "./setup"

const sectionTitles: Readonly<Record<JiraSetupSection, () => string>> = {
  people: m.jira_import_people_title,
  statuses: m.jira_import_statuses_title,
  types: m.jira_import_types_title,
  priorities: m.jira_import_priorities_title,
  tags: m.jira_import_tags_title,
  sprints: m.jira_import_sprints_title,
  destination: m.jira_import_destination_title
}

export const jiraSectionTitle = (section: JiraSetupSection): string =>
  sectionTitles[section]()

export const statusesSummary = (
  statuses: JiraSetupCounts["statuses"]
): string => {
  const summary = m.jira_import_statuses_summary({
    total: statuses.total,
    targets: statuses.targets
  })
  return statuses.created > 0
    ? m.jira_import_statuses_summary_created({
        summary,
        created: statuses.created
      })
    : summary
}

const tagsSummary = (tags: JiraSetupCounts["tags"]): string => {
  if (tags.skipped > 0)
    return m.jira_import_tags_summary_skipped({
      total: tags.total - tags.skipped,
      skipped: tags.skipped
    })
  if (tags.merged > 0)
    return m.jira_import_tags_summary_merged({
      total: tags.total,
      merged: tags.merged
    })
  return m.jira_import_tags_summary({ total: tags.total })
}

export function jiraSectionSummary(
  section: JiraSetupSection,
  counts: JiraSetupCounts,
  setup: JiraImportSetup
): string {
  switch (section) {
    case "people":
      return m.jira_import_people_summary({
        linked: counts.people.linked,
        invited: counts.people.invited,
        unlinked: counts.people.unlinked
      })
    case "statuses":
      return statusesSummary(counts.statuses)
    case "types":
      return m.jira_import_types_summary({ total: counts.types.total })
    case "priorities":
      return m.jira_import_priorities_summary({
        total: counts.priorities.total
      })
    case "tags":
      return tagsSummary(counts.tags)
    case "sprints":
      return m.jira_import_sprints_summary({ total: counts.sprints.total })
    default:
      return m.jira_import_destination_summary({
        name: setup.destination.name,
        key: setup.destination.key
      })
  }
}

export const jiraCategoryLabel = (
  categoryKey: string | null
): string | null => {
  switch (categoryKey) {
    case "new":
      return m.jira_import_category_todo()
    case "indeterminate":
      return m.jira_import_category_in_progress()
    case "done":
      return m.jira_import_category_done()
    default:
      return null
  }
}
