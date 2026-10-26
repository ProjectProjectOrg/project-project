import type { JiraMigrationStatus } from "@pp/shared"

import { m } from "@/paraglide/messages"

export type JiraMigrationScreen =
  | "scan-progress"
  | "configuration"
  | "migration-progress"
  | "reconnect"
  | "failed"
  | "cancelled"
  | "succeeded"

export function jiraMigrationScreen(
  status: JiraMigrationStatus
): JiraMigrationScreen {
  switch (status) {
    case "scanning":
      return "scan-progress"
    case "needs_configuration":
    case "ready":
      return "configuration"
    case "migrating":
    case "cancelling":
      return "migration-progress"
    case "reconnect_required":
      return "reconnect"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "succeeded":
      return "succeeded"
  }
  status satisfies never
  throw new Error("Unreachable Jira migration status")
}

export function isActiveJiraMigration(status: JiraMigrationStatus): boolean {
  return (
    status === "scanning" || status === "migrating" || status === "cancelling"
  )
}

export function jiraMigrationStatusLabel(status: JiraMigrationStatus): string {
  switch (status) {
    case "scanning":
      return m.jira_migration_status_scanning()
    case "needs_configuration":
      return m.jira_migration_status_needs_configuration()
    case "ready":
      return m.jira_migration_status_ready()
    case "migrating":
      return m.jira_migration_status_migrating()
    case "cancelling":
      return m.jira_migration_status_cancelling()
    case "reconnect_required":
      return m.jira_migration_status_reconnect_required()
    case "failed":
      return m.jira_migration_status_failed()
    case "cancelled":
      return m.jira_migration_status_cancelled()
    case "succeeded":
      return m.jira_migration_status_succeeded()
  }
  status satisfies never
  throw new Error("Unreachable Jira migration status")
}
