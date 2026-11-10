import type { JiraMigrationStatus } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const jiraImportStages = [
  "source",
  "scan",
  "setup",
  "review",
  "import"
] as const

export type JiraImportStage = (typeof jiraImportStages)[number]

export const jiraImportSteps = ["scan", "setup", "review"] as const

export type JiraImportStep = (typeof jiraImportSteps)[number]

export type JiraImportScreen =
  | "scan-progress"
  | "scan-summary"
  | "setup"
  | "review"
  | "import-progress"
  | "failed"
  | "cancelled"
  | "reconnect"
  | "result"
  | "unavailable"

export type JiraImportScreenInput = Readonly<{
  status: JiraMigrationStatus
  hasScan: boolean
  canConfigure: boolean
  step: JiraImportStep | undefined
  reconfigure: boolean
  landing: JiraImportStep
}>

const configurationScreen = (step: JiraImportStep): JiraImportScreen =>
  step === "scan" ? "scan-summary" : step

export function jiraImportScreen({
  status,
  hasScan,
  canConfigure,
  step,
  reconfigure,
  landing
}: JiraImportScreenInput): JiraImportScreen {
  switch (status) {
    case "scanning":
      return "scan-progress"
    case "migrating":
    case "cancelling":
      return "import-progress"
    case "succeeded":
      return "result"
    case "needs_configuration":
    case "ready":
      return hasScan ? configurationScreen(step ?? landing) : "unavailable"
    default: {
      if (hasScan && canConfigure && reconfigure && step !== undefined)
        return configurationScreen(step)
      if (status === "failed") return "failed"
      return status === "cancelled" ? "cancelled" : "reconnect"
    }
  }
}

export const jiraImportStage = (
  screen: JiraImportScreen,
  hasScan: boolean
): JiraImportStage => {
  switch (screen) {
    case "scan-progress":
    case "scan-summary":
      return "scan"
    case "setup":
      return "setup"
    case "review":
      return "review"
    case "import-progress":
    case "result":
      return "import"
    default:
      return hasScan ? "import" : "scan"
  }
}

export const jiraLandingStep = (
  hasConfiguration: boolean,
  setupNeedsAttention: boolean
): JiraImportStep =>
  !hasConfiguration ? "scan" : setupNeedsAttention ? "setup" : "review"

export const isConfiguringJiraImport = (status: JiraMigrationStatus): boolean =>
  status === "needs_configuration" || status === "ready"

export const isActiveJiraImport = (status: JiraMigrationStatus): boolean =>
  status === "scanning" || status === "migrating" || status === "cancelling"

export const isFinishedJiraImport = (status: JiraMigrationStatus): boolean =>
  status === "succeeded" || status === "cancelled"

export const jiraImportStageIndex = (stage: JiraImportStage): number =>
  jiraImportStages.indexOf(stage)

const stageLabels: Readonly<Record<JiraImportStage, () => string>> = {
  source: m.jira_import_stage_source,
  scan: m.jira_import_stage_scan,
  setup: m.jira_import_stage_setup,
  review: m.jira_import_stage_review,
  import: m.jira_import_stage_import
}

export const jiraImportStageLabel = (stage: JiraImportStage): string =>
  stageLabels[stage]()

const statusLabels: Readonly<Record<JiraMigrationStatus, () => string>> = {
  scanning: m.jira_import_status_scanning,
  needs_configuration: m.jira_import_status_setting_up,
  ready: m.jira_import_status_setting_up,
  migrating: m.jira_import_status_importing,
  cancelling: m.jira_import_status_cancelling,
  reconnect_required: m.jira_import_status_reconnect,
  failed: m.jira_import_status_failed,
  cancelled: m.jira_import_status_cancelled,
  succeeded: m.jira_import_status_done
}

export const jiraImportStatusLabel = (status: JiraMigrationStatus): string =>
  statusLabels[status]()
