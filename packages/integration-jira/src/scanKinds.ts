import * as Schema from "effect/Schema"

export const JiraScanKind = Schema.Literals([
  "identity-options",
  "account",
  "project",
  "fields",
  "statuses",
  "priorities",
  "components",
  "versions",
  "boards",
  "boardConfiguration",
  "sprints",
  "sprintIssues",
  "issues",
  "comments",
  "changelogs",
  "worklogs",
  "watchers",
  "votes",
  "attachments"
])
export type JiraScanKind = typeof JiraScanKind.Type

export const ISSUE_DEPENDENT_SCAN_KINDS = [
  "comments",
  "changelogs",
  "worklogs",
  "watchers",
  "votes",
  "attachments"
] as const satisfies ReadonlyArray<JiraScanKind>

export const BOARD_SCAN_KINDS: ReadonlySet<string> = new Set<JiraScanKind>([
  "boardConfiguration",
  "sprints",
  "sprintIssues"
])

export const SKIPPABLE_SCAN_KINDS: ReadonlySet<JiraScanKind> =
  new Set<JiraScanKind>([
    "comments",
    "changelogs",
    "worklogs",
    "watchers",
    "votes"
  ])

export const OPTIONAL_SCAN_KINDS: ReadonlySet<JiraScanKind> =
  new Set<JiraScanKind>([
    "watchers",
    "votes",
    "boards",
    "boardConfiguration",
    "sprints",
    "sprintIssues",
    "comments",
    "changelogs",
    "worklogs"
  ])

export const SCAN_COUNT_KINDS: ReadonlySet<string> = new Set<JiraScanKind>([
  "issues",
  "comments",
  "attachments",
  "worklogs",
  "changelogs",
  "components",
  "versions",
  "boards",
  "sprints"
])
