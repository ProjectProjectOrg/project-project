import type { JiraMigrationScanSummary } from "@pp/shared"

import { m } from "@/paraglide/messages"

type VisibilityWarning = JiraMigrationScanSummary["visibilityWarnings"][number]

const categoryLabels = new Map<string, () => string>(
  Object.entries({
    account: m.jira_import_warning_account,
    attachments: m.jira_import_warning_attachments,
    boardConfiguration: m.jira_import_warning_board_configuration,
    boards: m.jira_import_warning_boards,
    changelogs: m.jira_import_warning_changelogs,
    comments: m.jira_import_warning_comments,
    components: m.jira_import_warning_components,
    fields: m.jira_import_warning_fields,
    groups: m.jira_import_warning_sprints,
    identities: m.jira_import_warning_people,
    issues: m.jira_import_warning_issues,
    priorities: m.jira_import_warning_priorities,
    sprints: m.jira_import_warning_sprints,
    statuses: m.jira_import_warning_statuses,
    users: m.jira_import_warning_people,
    versions: m.jira_import_warning_versions,
    votes: m.jira_import_warning_votes,
    watchers: m.jira_import_warning_watchers,
    worklogs: m.jira_import_warning_worklogs
  })
)

const isGenericPermission = (detail: string | null): boolean =>
  detail === null || detail === "jira-permissions"

const reasonText = (detail: string | null): string => {
  if (isGenericPermission(detail)) return m.jira_import_warning_permission()
  switch (detail) {
    case "permission_denied":
      return m.jira_import_warning_permission()
    case "unsupported_or_missing":
      return m.jira_import_warning_unsupported()
    default:
      return m.jira_import_warning_partial()
  }
}

export type JiraVisibilityRow = Readonly<{
  label: string
  detail: string
}>

export type JiraVisibility =
  | Readonly<{ kind: "complete" }>
  | Readonly<{ kind: "account" }>
  | Readonly<{ kind: "limited"; rows: ReadonlyArray<JiraVisibilityRow> }>

export function jiraVisibility(
  warnings: ReadonlyArray<VisibilityWarning>
): JiraVisibility {
  if (warnings.length === 0) return { kind: "complete" }
  if (warnings.every((warning) => isGenericPermission(warning.detail)))
    return { kind: "account" }
  const known = new Map<string, JiraVisibilityRow>()
  const other = new Set<string>()
  for (const warning of warnings) {
    const label = categoryLabels.get(warning.category)
    const detail = reasonText(warning.detail)
    if (label === undefined) other.add(detail)
    else {
      const row = { label: label(), detail }
      known.set(`${row.label}\u0000${row.detail}`, row)
    }
  }
  const otherDetail = [...other]
  const rows = [...known.values()]
  return {
    kind: "limited",
    rows:
      otherDetail.length === 0
        ? rows
        : [
            ...rows,
            {
              label: m.jira_import_warning_other(),
              detail:
                otherDetail.length === 1 && otherDetail[0] !== undefined
                  ? otherDetail[0]
                  : m.jira_import_warning_partial()
            }
          ]
  }
}
