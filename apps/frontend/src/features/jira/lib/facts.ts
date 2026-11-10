import type { JiraMigrationCounts } from "@pp/shared"

import { m } from "@/paraglide/messages"

export type JiraFact = Readonly<{ label: string; value: number }>

const optional = (
  label: () => string,
  value: number | undefined,
  hideZero = false
): ReadonlyArray<JiraFact> =>
  value === undefined || (hideZero && value === 0)
    ? []
    : [{ label: label(), value }]

export const scanFacts = (
  counts: JiraMigrationCounts
): ReadonlyArray<JiraFact> => [
  { label: m.jira_import_fact_tickets(), value: counts.issues },
  ...optional(m.jira_import_fact_epics_found, counts.epics, true),
  ...optional(m.jira_import_fact_sub_tickets_found, counts.subTickets),
  { label: m.jira_import_fact_comments(), value: counts.comments },
  { label: m.jira_import_fact_attachments(), value: counts.attachments },
  { label: m.jira_import_fact_people(), value: counts.identities },
  ...optional(m.jira_import_fact_sprints, counts.sprints),
  { label: m.jira_import_fact_tags(), value: counts.tags },
  { label: m.jira_import_fact_statuses(), value: counts.statuses },
  { label: m.jira_import_fact_types(), value: counts.issueTypes },
  { label: m.jira_import_fact_priorities(), value: counts.priorities }
]
