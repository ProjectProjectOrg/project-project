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
): boolean =>
  failedAttachmentIds.length === 0 ||
  failedAttachmentIds.some((id) => skippedAttachmentIds.includes(id))

export const reviewNeeds = (readiness: ReviewReadiness): string | null => {
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

export const reviewBlocked = (readiness: ReviewReadiness): boolean =>
  !readiness.conflictsChecked ||
  reviewNeeds(readiness) !== null ||
  readiness.saveFailed ||
  readiness.saving

type RestrictedIssue = NonNullable<
  JiraMigrationRequirements["restrictedContent"]["issues"]
>[number]

export const excludedIssues = (
  requirements: JiraMigrationRequirements,
  draft: JiraImportDraft
): ReadonlyArray<RestrictedIssue> =>
  draft.review.restrictedContent.policy === "exclude"
    ? (requirements.restrictedContent.issues ?? [])
    : []
