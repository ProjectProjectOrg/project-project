import type { JiraMigrationDetail, TypeDefinition } from "@pp/shared"

import { buildJiraImportDraft } from "./draft"
import {
  jiraSetupCounts,
  setupNeedsAttention,
  visibleSetupSections
} from "./setup"
import { jiraLandingStep, type JiraImportStep } from "./stages"

export function jiraImportLanding(
  detail: Pick<JiraMigrationDetail, "requirements" | "configuration">,
  types: ReadonlyArray<TypeDefinition>
): JiraImportStep {
  if (detail.requirements === null) return "scan"
  const draft = buildJiraImportDraft(
    detail.requirements,
    detail.configuration,
    types
  )
  const counts = jiraSetupCounts(draft.setup, detail.requirements, 0)
  return jiraLandingStep(
    detail.configuration !== null,
    setupNeedsAttention(counts, visibleSetupSections(detail.requirements))
  )
}

export type JiraImportNames = Readonly<{ source: string; destination: string }>

export const jiraImportTitle = (
  detail: Pick<
    JiraMigrationDetail,
    | "sourceProjectKey"
    | "sourceProjectName"
    | "destination"
    | "configuration"
    | "requirements"
  >
): JiraImportNames => ({
  source: detail.sourceProjectKey,
  destination:
    detail.configuration?.destination.name ??
    detail.destination?.name ??
    detail.requirements?.destination.suggestedName ??
    detail.sourceProjectName
})
