import { m } from "@/paraglide/messages"

export type JiraScanCount = Readonly<{
  kind: string
  count: number
  label: string
}>

const primaryKinds = ["issues", "comments", "attachments"] as const

const kindLabels = new Map<string, (inputs: { count: number }) => string>(
  Object.entries({
    issues: m.jira_import_scan_kind_issues,
    comments: m.jira_import_scan_kind_comments,
    attachments: m.jira_import_scan_kind_attachments,
    worklogs: m.jira_import_scan_kind_worklogs,
    changelogs: m.jira_import_scan_kind_changelogs,
    components: m.jira_import_scan_kind_components,
    versions: m.jira_import_scan_kind_versions,
    boards: m.jira_import_scan_kind_boards,
    sprints: m.jira_import_scan_kind_sprints
  })
)

export type JiraScanCountLine = Readonly<{
  primary: ReadonlyArray<JiraScanCount>
  secondary: ReadonlyArray<JiraScanCount>
}>

export function jiraScanCountLine(
  counts: Readonly<Record<string, number>> | undefined
): JiraScanCountLine {
  const entries = Object.entries(counts ?? {}).flatMap(([kind, count]) => {
    const label = kindLabels.get(kind)
    return label === undefined ? [] : [{ kind, count, label: label({ count }) }]
  })
  const isPrimary = (kind: string) =>
    (primaryKinds as ReadonlyArray<string>).includes(kind)
  return {
    primary: primaryKinds.flatMap((kind) =>
      entries.filter((entry) => entry.kind === kind)
    ),
    secondary: entries.filter((entry) => !isPrimary(entry.kind))
  }
}
