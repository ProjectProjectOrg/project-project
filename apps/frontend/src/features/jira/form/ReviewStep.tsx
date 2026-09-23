import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  JiraMigrationDestinationConflict,
  JiraMigrationRequirements,
  JiraMigrationScanSummary
} from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Check } from "lucide-react"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { jiraDestinationConflictsAtom } from "@/features/jira/atoms/jiraMigration"
import { useFormValues } from "@/lib/form"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

export function ReviewStep({
  form,
  orgSlug,
  migrationId,
  revision,
  requirements,
  summary,
  failedAttachmentIds,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  const conflictsAtom = jiraDestinationConflictsAtom({
    params: { orgSlug, migrationId },
    query: { expectedRevision: revision }
  })
  const conflicts = useAtomValue(conflictsAtom)
  const refreshConflicts = useAtomRefresh(conflictsAtom)
  const { attachmentSkipsAccepted, skippedAttachmentIds } = useFormValues(form)
  const forcedSkips = requirements.attachments.filter(
    (attachment) => attachment.forcedSkipReason !== null
  )
  const failedAttachments = requirements.attachments.filter((attachment) =>
    failedAttachmentIds.includes(attachment.jiraAttachmentId)
  )
  const failedSkipsSelected = failedAttachments.some((attachment) =>
    skippedAttachmentIds.includes(attachment.jiraAttachmentId)
  )
  const canStart =
    Result.isSuccess(conflicts) &&
    conflicts.value.length === 0 &&
    (skippedAttachmentIds.length === 0 || attachmentSkipsAccepted) &&
    (failedAttachmentIds.length === 0 || failedSkipsSelected)
  const restricted = requirements.restrictedContent
  const hasRestrictedContent =
    restricted.issueCount > 0 ||
    restricted.commentCount > 0 ||
    restricted.worklogCount > 0

  return (
    <StepFrame
      title={m.jira_migration_review_title()}
      description={m.jira_migration_review_description()}
      waiting={waiting}
      error={error}
      nextLabel={m.jira_migration_action_start()}
      nextDisabled={!canStart}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="space-y-7">
        <div className="border-y border-border py-4">
          <div className="text-xs text-muted-foreground">
            {m.jira_migration_destination_name()}
          </div>
          <form.Subscribe selector={(state) => state.values.destination}>
            {(destination) => (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{destination.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {destination.key} · {destination.slug}
                </span>
              </div>
            )}
          </form.Subscribe>
          <div className="mt-3 font-mono text-xs text-muted-foreground">
            {m.jira_migration_review_counts({
              issues: summary.counts.issues,
              comments: summary.counts.comments,
              attachments: summary.counts.attachments
            })}
          </div>
          <form.Subscribe selector={(state) => state.values.statuses}>
            {(statuses) => {
              const createdCount = statuses.filter(
                (status) => status.createStatus === true
              ).length
              return createdCount > 0 ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  {m.jira_migration_review_created_statuses({
                    count: createdCount
                  })}
                </div>
              ) : null
            }}
          </form.Subscribe>
        </div>

        {Result.matchWithError(conflicts, {
          onInitial: () => (
            <p role="status" className="text-sm text-muted-foreground">
              {m.jira_migration_review_conflicts_checking()}
            </p>
          ),
          onError: (error) => (
            <ErrorPage error={error} reset={refreshConflicts} contained />
          ),
          onDefect: (defect) => (
            <ErrorPage error={defect} reset={refreshConflicts} contained />
          ),
          onSuccess: ({ value }) =>
            value.length === 0 ? (
              <p role="status" className="text-sm text-muted-foreground">
                {m.jira_migration_review_conflicts_clear()}
              </p>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <h3 className="text-sm font-semibold text-destructive">
                  {m.jira_migration_review_conflicts_title()}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {m.jira_migration_review_conflicts_description()}
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {value.map((conflict) => (
                    <li key={`${conflict.kind}:${conflict.value}`}>
                      {conflictMessage(conflict)}
                    </li>
                  ))}
                </ul>
              </div>
            )
        })}

        {hasRestrictedContent ? (
          <div>
            <h3 className="text-sm font-semibold">
              {m.jira_migration_restricted_title()}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {m.jira_migration_restricted_description()}
            </p>
            <form.Field name="restrictedContent">
              {(field) => (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ChoiceButton
                    selected={field.value?.policy === "exclude"}
                    onClick={() => field.handleChange({ policy: "exclude" })}
                  >
                    {m.jira_migration_restricted_exclude()}
                  </ChoiceButton>
                  <ChoiceButton
                    selected={field.value?.policy === "include"}
                    onClick={() =>
                      field.handleChange({
                        policy: "include",
                        disclosureAccepted: true
                      })
                    }
                  >
                    {m.jira_migration_restricted_include()}
                  </ChoiceButton>
                </div>
              )}
            </form.Field>
          </div>
        ) : null}

        {forcedSkips.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">
              {m.jira_migration_attachments_title()}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {m.jira_migration_attachments_description()}
            </p>
            <ul className="mt-3 divide-y divide-border">
              {forcedSkips.map((attachment) => (
                <li
                  key={attachment.jiraAttachmentId}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {attachment.filename}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.jira_migration_attachment_forced()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {failedAttachments.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">
              {m.jira_migration_attachment_failed_title()}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {m.jira_migration_attachment_failed_description()}
            </p>
            <form.Field name="skippedAttachmentIds">
              {(field) => (
                <ul className="mt-3 divide-y divide-border">
                  {failedAttachments.map((attachment) => (
                    <li key={attachment.jiraAttachmentId}>
                      <label className="flex cursor-pointer items-center justify-between gap-4 py-3 text-sm">
                        <span className="min-w-0 truncate">
                          {attachment.filename}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.value.includes(
                              attachment.jiraAttachmentId
                            )}
                            className="size-4 accent-primary"
                            onChange={(event) =>
                              field.handleChange(
                                event.currentTarget.checked
                                  ? [
                                      ...new Set([
                                        ...field.value,
                                        attachment.jiraAttachmentId
                                      ])
                                    ]
                                  : field.value.filter(
                                      (id) => id !== attachment.jiraAttachmentId
                                    )
                              )
                            }
                          />
                          {m.jira_migration_attachment_leave_out()}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </form.Field>
            {!failedSkipsSelected ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {m.jira_migration_attachment_choose_or_retry()}
              </p>
            ) : null}
          </div>
        ) : null}

        {skippedAttachmentIds.length > 0 ? (
          <div>
            <form.Field name="attachmentSkipsAccepted">
              {(field) => (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:bg-accent/60">
                  <input
                    type="checkbox"
                    checked={field.value}
                    className="mt-0.5 size-4 accent-primary"
                    onChange={(event) =>
                      field.handleChange(event.currentTarget.checked)
                    }
                  />
                  <span>{m.jira_migration_attachment_accept()}</span>
                </label>
              )}
            </form.Field>
            {!attachmentSkipsAccepted ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {m.jira_migration_attachment_accept_required()}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </StepFrame>
  )
}

function ChoiceButton({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <Button
      type="button"
      variant="tertiary"
      className={cn(
        "h-auto min-h-11 justify-start py-2.5 text-left whitespace-normal",
        selected && "border-foreground bg-accent"
      )}
      leadingIcon={selected ? Check : undefined}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  orgSlug: string
  migrationId: string
  revision: number
  requirements: JiraMigrationRequirements
  summary: JiraMigrationScanSummary
  failedAttachmentIds: ReadonlyArray<string>
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>

function conflictMessage(conflict: JiraMigrationDestinationConflict): string {
  switch (conflict.kind) {
    case "project_slug":
      return m.jira_migration_review_conflict_slug({ value: conflict.value })
    case "project_key":
      return m.jira_migration_review_conflict_key({ value: conflict.value })
    case "ticket_id":
      return m.jira_migration_review_conflict_ticket({ value: conflict.value })
  }
  throw new Error("Unknown destination conflict")
}
