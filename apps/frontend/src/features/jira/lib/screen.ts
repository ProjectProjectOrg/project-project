import type { JiraMigrationDetail } from "@pp/shared"

import { m } from "@/paraglide/messages"

import {
  isConfiguringJiraImport,
  type JiraImportScreen,
  type JiraImportStage
} from "./stages"

type ScreenDetail = Pick<JiraMigrationDetail, "status" | "actions">

const stoppedStatuses: ReadonlySet<JiraMigrationDetail["status"]> = new Set([
  "failed",
  "cancelled",
  "reconnect_required"
])

export function navigableStages(detail: ScreenDetail, hasScan: boolean) {
  if (!hasScan) return [] satisfies ReadonlyArray<JiraImportStage>
  if (isConfiguringJiraImport(detail.status))
    return ["scan", "setup", "review"] satisfies ReadonlyArray<JiraImportStage>
  return (
    detail.actions.canConfigure && stoppedStatuses.has(detail.status)
      ? ["setup", "review", "import"]
      : []
  ) satisfies ReadonlyArray<JiraImportStage>
}

export const jiraProgressCount = (
  progress: JiraMigrationDetail["progress"]
) => {
  if (progress.total !== null)
    return m.jira_import_progress_of({
      done: progress.done,
      total: progress.total
    })
  return progress.done > 0
    ? m.jira_import_progress_read({ count: progress.done })
    : null
}

export type JiraCancelCopy = Readonly<{
  trigger: string
  prompt: string
  label: string
}>

export const jiraCancelCopy = (screen: JiraImportScreen) =>
  screen === "scan-progress"
    ? ({
        trigger: m.jira_import_action_cancel_scan(),
        prompt: m.jira_import_cancel_scan_prompt(),
        label: m.jira_import_action_stop()
      } satisfies JiraCancelCopy)
    : ({
        trigger: m.jira_import_action_cancel_import(),
        prompt: m.jira_import_cancel_import_prompt(),
        label: m.jira_import_action_stop()
      } satisfies JiraCancelCopy)

export type JiraStoppedKind = "failed" | "cancelled" | "unavailable"

export const jiraStoppedKind = (screen: JiraImportScreen) =>
  screen === "cancelled" || screen === "unavailable" ? screen : "failed"
