import type { JiraMigrationSummary } from "@pp/shared"
import * as DateTime from "effect/DateTime"

import {
  isActiveJiraImport,
  isConfiguringJiraImport,
  isFinishedJiraImport
} from "./stages"

export type JiraImportGroups = Readonly<{
  running: ReadonlyArray<JiraMigrationSummary>
  setup: ReadonlyArray<JiraMigrationSummary>
  finished: ReadonlyArray<JiraMigrationSummary>
}>

const newestFirst = (a: JiraMigrationSummary, b: JiraMigrationSummary) =>
  DateTime.toEpochMillis(b.updatedAt) - DateTime.toEpochMillis(a.updatedAt)

export const isRunningJiraImport = (summary: JiraMigrationSummary): boolean =>
  isActiveJiraImport(summary.status) ||
  summary.status === "failed" ||
  summary.status === "reconnect_required"

export function groupJiraImports(
  imports: ReadonlyArray<JiraMigrationSummary>
): JiraImportGroups {
  const sorted = imports.toSorted(newestFirst)
  return {
    running: sorted.filter(isRunningJiraImport),
    setup: sorted.filter((summary) => isConfiguringJiraImport(summary.status)),
    finished: sorted.filter((summary) => isFinishedJiraImport(summary.status))
  }
}

export const unfinishedImportOf = (
  imports: ReadonlyArray<JiraMigrationSummary>,
  cloudId: string,
  projectId: string
): JiraMigrationSummary | undefined =>
  imports
    .toSorted(newestFirst)
    .find(
      (summary) =>
        summary.sourceCloudId === cloudId &&
        summary.sourceProjectId === projectId &&
        !isFinishedJiraImport(summary.status)
    )

export const jiraProgressRatio = (
  progress: JiraMigrationSummary["progress"]
): number | null =>
  progress.total === null || progress.total <= 0
    ? null
    : Math.min(1, Math.max(0, progress.done / progress.total))
