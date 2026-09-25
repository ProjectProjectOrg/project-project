import type { JiraMigrationStatus } from "@pp/shared"

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
