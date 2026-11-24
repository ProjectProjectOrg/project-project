import type { JiraMigrationRequirements } from "@pp/shared"

import { m } from "@/paraglide/messages"

import type { JiraImportDraft } from "./draft"

export type ReviewReadiness = Readonly<{
  conflictsChecked: boolean
  conflictCount: number
  failedAttachmentIds: ReadonlyArray<string>
  skippedAttachmentIds: ReadonlyArray<string>
  saving: boolean
  saveFailed: boolean
}>

export const failedFilesChosen = (
  failedAttachmentIds: ReadonlyArray<string>,
  skippedAttachmentIds: ReadonlyArray<string>
) => {
  if (failedAttachmentIds.length === 0) return true
  const skipped = new Set(skippedAttachmentIds)
  return failedAttachmentIds.some((id) => skipped.has(id))
}

export const reviewNeeds = (readiness: ReviewReadiness) => {
  if (readiness.conflictCount > 0)
    return m.jira_import_review_needs_destination()
  if (
    !failedFilesChosen(
      readiness.failedAttachmentIds,
      readiness.skippedAttachmentIds
    )
  )
    return m.jira_import_review_needs_failed()
  return null
}

export const reviewBlocked = (readiness: ReviewReadiness) =>
  !readiness.conflictsChecked ||
  reviewNeeds(readiness) !== null ||
  readiness.saveFailed ||
  readiness.saving

export const excludedIssues = (
  requirements: JiraMigrationRequirements,
  draft: JiraImportDraft
) =>
  draft.review.restrictedContent.policy === "exclude"
    ? (requirements.restrictedContent.issues ?? [])
    : []
