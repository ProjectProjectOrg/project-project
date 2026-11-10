import type { JiraMigrationDetail } from "@pp/shared"

export type JiraFailureKind =
  | "jira_unreachable"
  | "jira_response"
  | "jira_rate_limited"
  | "jira_access"
  | "project_access_lost"
  | "project_not_found"
  | "storage"
  | "file_write"
  | "service_unavailable"
  | "stalled"
  | "paused"
  | "setup"
  | "attachments"
  | "scan_incomplete"
  | "superseded"
  | "verification"
  | "internal"
  | "unknown"

export type JiraFailureAction =
  | "retry"
  | "reconnect"
  | "connect_storage"
  | "fix_setup"
  | "leave_out_files"
  | "scan_again"

const reasons: ReadonlyArray<
  readonly [JiraFailureKind, ReadonlyArray<string>]
> = [
  [
    "jira_unreachable",
    [
      "network",
      "timeout",
      "server_error",
      "refresh_contention",
      "unavailable",
      "jira_unavailable"
    ]
  ],
  [
    "jira_response",
    [
      "invalid_response",
      "bad_request",
      "cursor_expired",
      "unexpected_status",
      "decode_failed",
      "invalid_json",
      "invalid_redirect",
      "repeated_cursor"
    ]
  ],
  ["jira_rate_limited", ["rate_limited", "jira_rate_limited"]],
  [
    "jira_access",
    [
      "invalid_grant",
      "missing_scopes",
      "reconnect_required",
      "jira_reconnect_required",
      "oauth_state_invalid",
      "invalid_return_path",
      "credential_unreadable"
    ]
  ],
  [
    "project_access_lost",
    ["jira_project_access_lost", "permission_denied", "access_denied"]
  ],
  ["project_not_found", ["jira_project_not_found"]],
  [
    "storage",
    [
      "storage_unavailable",
      "storage_not_connected",
      "jira_migration_storage_unavailable"
    ]
  ],
  [
    "file_write",
    ["jira_migration_file_write_failed", "jira_migration_markdown_failed"]
  ],
  [
    "service_unavailable",
    ["jira_migration_temporarily_unavailable", "worker_unavailable"]
  ],
  ["stalled", ["jira_migration_stalled"]],
  ["paused", ["jira_migration_attempt_paused"]],
  [
    "setup",
    [
      "preflight_blocked",
      "jira_migration_preparation_invalid",
      "jira_migration_plan_mismatch"
    ]
  ],
  ["attachments", ["jira_migration_attachment_outcome_invalid"]],
  ["scan_incomplete", ["jira_migration_scan_incomplete"]],
  ["superseded", ["jira_migration_superseded"]],
  ["verification", ["jira_migration_publication_invalid"]],
  [
    "internal",
    [
      "internal_error",
      "jira_migration_database_failed",
      "jira_migration_write_intent_failed",
      "jira_migration_workflow_defect",
      "jira_migration_cleanup_failed",
      "write_intent"
    ]
  ]
]

const jiraFailureKind = (
  detail: Pick<
    JiraMigrationDetail,
    "status" | "failure" | "failedAttachmentIds"
  >
): JiraFailureKind => {
  if (detail.status === "reconnect_required") return "jira_access"
  if (detail.failedAttachmentIds.length > 0) return "attachments"
  const reason = detail.failure?.reason ?? null
  if (reason === null) return "unknown"
  return reasons.find(([, codes]) => codes.includes(reason))?.[0] ?? "unknown"
}

const preferred: Readonly<
  Record<JiraFailureKind, ReadonlyArray<JiraFailureAction>>
> = {
  jira_unreachable: ["retry", "scan_again"],
  jira_response: ["retry", "scan_again"],
  jira_rate_limited: ["retry", "scan_again"],
  jira_access: ["reconnect", "retry", "scan_again"],
  project_access_lost: ["scan_again", "reconnect"],
  project_not_found: ["scan_again"],
  storage: ["connect_storage", "retry", "scan_again"],
  file_write: ["retry", "connect_storage", "scan_again"],
  service_unavailable: ["retry", "scan_again"],
  stalled: ["scan_again"],
  paused: ["retry", "scan_again"],
  setup: ["fix_setup", "scan_again"],
  attachments: ["leave_out_files", "retry", "scan_again"],
  scan_incomplete: ["scan_again", "retry"],
  superseded: ["scan_again"],
  verification: ["scan_again"],
  internal: ["retry", "scan_again"],
  unknown: ["retry", "scan_again"]
}

type FailureDetail = Pick<
  JiraMigrationDetail,
  "status" | "failure" | "actions" | "scanSummary" | "failedAttachmentIds"
>

const available: Readonly<
  Record<JiraFailureAction, (detail: FailureDetail) => boolean>
> = {
  retry: (detail) => detail.actions.canRetry,
  reconnect: () => true,
  connect_storage: () => true,
  fix_setup: (detail) =>
    detail.actions.canConfigure && detail.scanSummary !== null,
  leave_out_files: (detail) =>
    detail.actions.canConfigure &&
    detail.scanSummary !== null &&
    detail.failedAttachmentIds.length > 0,
  scan_again: (detail) => detail.actions.canRescan
}

export type JiraFailurePlan = Readonly<{
  kind: JiraFailureKind
  primary: JiraFailureAction | null
  secondary: ReadonlyArray<JiraFailureAction>
}>

export function jiraFailurePlan(detail: FailureDetail): JiraFailurePlan {
  const kind = jiraFailureKind(detail)
  const actions = preferred[kind].filter((action) => available[action](detail))
  const [primary = null, ...secondary] = actions
  return { kind, primary, secondary }
}

export const jiraStoppedActions = (
  detail: FailureDetail,
  kind: "failed" | "cancelled" | "unavailable"
): ReadonlyArray<JiraFailureAction> => {
  if (kind !== "failed") return detail.actions.canRescan ? ["scan_again"] : []
  const plan = jiraFailurePlan(detail)
  return plan.primary === null ? [] : [plan.primary, ...plan.secondary]
}
