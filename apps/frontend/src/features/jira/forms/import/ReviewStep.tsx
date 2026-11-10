import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  JiraMigrationDetail,
  JiraMigrationRequirements,
  JiraMigrationScanSummary
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import {
  jiraDestinationConflicts,
  jiraDestinationConflictsRequest
} from "@/features/jira/atoms/jiraMigration"
import { ReadFailure } from "@/features/jira/components/ReadFailure"
import { StepFrame, StepNote } from "@/features/jira/components/StepFrame"
import type { JiraImportDraftSave } from "@/features/jira/hooks/useJiraImportDraft"
import { useSyncDraftOnOpen } from "@/features/jira/hooks/useSyncDraftOnOpen"
import { conflictingFields } from "@/features/jira/lib/destination"
import { reviewBlocked, reviewNeeds } from "@/features/jira/lib/review"
import {
  jiraSetupCounts,
  type JiraSetupSection
} from "@/features/jira/lib/setup"
import { useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { reviewSchema, validateStep, type JiraImportForm } from "./opts"
import { CreatedBlock, LeftBehindBlock } from "./ReviewBlocks"
import { ChoicesBlock } from "./ReviewChoices"
import { SaveStatus } from "./SaveStatus"

export function ReviewStep({
  form,
  orgSlug,
  detail,
  requirements,
  summary,
  draft,
  starting,
  startError,
  onChangeSection,
  onBack,
  onReload,
  returnPath
}: Readonly<{
  form: JiraImportForm
  orgSlug: string
  detail: JiraMigrationDetail
  requirements: JiraMigrationRequirements
  summary: JiraMigrationScanSummary
  draft: JiraImportDraftSave
  starting: boolean
  startError: string | null
  onChangeSection: (section: JiraSetupSection) => void
  onBack: () => void
  onReload: () => void
  returnPath: string
}>) {
  const values = useFormValues(form)
  const conflictsAtom = jiraDestinationConflicts(
    jiraDestinationConflictsRequest(orgSlug, detail.id, detail.revision)
  )
  const conflictsResult = useAtomValue(conflictsAtom)
  const refreshConflicts = useAtomRefresh(conflictsAtom)
  const conflicts = AsyncResult.isSuccess(conflictsResult)
    ? conflictsResult.value
    : []
  const counts = jiraSetupCounts(
    values.setup,
    requirements,
    conflictingFields(conflicts)
  )
  const [validator] = useState(() => Schema.toStandardSchemaV1(reviewSchema))
  const { persist } = draft
  const commit = () => persist(form.state.values)
  useSyncDraftOnOpen(form, detail.configuration, persist)
  const readiness = {
    conflictsChecked: AsyncResult.isSuccess(conflictsResult),
    conflictCount: conflictingFields(conflicts),
    failedAttachmentIds: detail.failedAttachmentIds,
    skippedAttachmentIds: values.review.skippedAttachmentIds,
    saving: draft.saving,
    saveFailed: draft.failure !== null
  }
  const needed = reviewNeeds(readiness)
  const blocked = reviewBlocked(readiness)
  const saveStatus = (
    <SaveStatus draft={draft} onReload={onReload} returnPath={returnPath} />
  )

  return (
    <form.FormGroup
      name="review"
      validators={[validateStep(validator)]}
      onSubmit={async () => {
        await form.handleSubmit()
      }}
    >
      {(group) => (
        <StepFrame
          title={m.jira_import_review_title()}
          description={m.jira_import_review_description()}
          start={
            <Button variant="ghost" bleed="start" onClick={onBack}>
              {m.jira_import_action_back()}
            </Button>
          }
          error={startError}
          end={
            <>
              {startError !== null ? null : (
                <AsyncView
                  result={conflictsResult}
                  onInitial={() => (
                    <StepNote>{m.jira_import_review_needs_check()}</StepNote>
                  )}
                  onFailure={(failure) => (
                    <ReadFailure failure={failure} onRetry={refreshConflicts} />
                  )}
                  onSuccess={() =>
                    needed !== null && draft.failure === null ? (
                      <StepNote>{needed}</StepNote>
                    ) : (
                      saveStatus
                    )
                  }
                />
              )}
              <Button
                disabled={blocked}
                loading={starting}
                onClick={() => void group.handleSubmit()}
              >
                {m.jira_import_action_start()}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-10">
            <CreatedBlock
              requirements={requirements}
              summary={summary}
              draft={values}
              counts={counts}
              conflicts={conflicts}
            />
            <LeftBehindBlock
              form={form}
              requirements={requirements}
              summary={summary}
              draft={values}
              failedAttachmentIds={detail.failedAttachmentIds}
              commit={commit}
            />
            <ChoicesBlock
              requirements={requirements}
              counts={counts}
              draft={values}
              onChangeSection={onChangeSection}
            />
          </div>
        </StepFrame>
      )}
    </form.FormGroup>
  )
}
