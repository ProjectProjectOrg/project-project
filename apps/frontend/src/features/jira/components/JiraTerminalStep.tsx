import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { JiraMigrationDetail, JiraSkippedAttachment } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  jiraMigrationKey,
  jiraSkippedAttachmentsAtom
} from "@/features/jira/atoms/jiraMigration"
import { m } from "@/paraglide/messages"

type JiraTerminalStepProps = Readonly<{
  detail: JiraMigrationDetail
  orgSlug: string
  waiting: boolean
  error?: string | null
  onRetry?: () => void
  onReconfigure?: () => void
  onRescan?: () => void
  onDiscard?: () => void
}>

export function JiraTerminalStep({
  detail,
  orgSlug,
  waiting,
  error,
  onRetry,
  onReconfigure,
  onRescan,
  onDiscard
}: JiraTerminalStepProps) {
  if (detail.status === "succeeded") {
    return (
      <TerminalSurface
        title={m.jira_migration_success_title()}
        description={m.jira_migration_success_description()}
        details={
          detail.configuration?.skippedAttachmentIds.length ? (
            <SkippedAttachments orgSlug={orgSlug} migrationId={detail.id} />
          ) : null
        }
      >
        {detail.destinationProjectSlug ? (
          <Button
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug"
                params={{ orgSlug, slug: detail.destinationProjectSlug }}
              />
            }
          >
            {m.jira_migration_action_open_project()}
          </Button>
        ) : null}
      </TerminalSurface>
    )
  }

  const cancelled = detail.status === "cancelled"
  const reconnect = detail.status === "reconnect_required"
  const discardBlocked =
    (cancelled || detail.status === "failed") && !detail.actions.canDiscard
  const title = reconnect
    ? m.jira_migration_reconnect_title()
    : cancelled
      ? m.jira_migration_cancelled_title()
      : m.jira_migration_failed_title()
  const description = reconnect
    ? m.jira_migration_reconnect_description()
    : cancelled
      ? m.jira_migration_cancelled_description()
      : failureDescription(detail.failure)

  return (
    <TerminalSurface
      title={title}
      description={description}
      details={
        discardBlocked ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {m.jira_migration_discard_unavailable_description()}
          </p>
        ) : null
      }
      error={error}
    >
      {reconnect ? (
        <Button
          render={
            <a
              href={`/api/integrations/jira/oauth/start?returnPath=${encodeURIComponent(`/orgs/${orgSlug}/migrations/jira/${detail.id}`)}`}
            />
          }
        >
          {m.jira_migration_action_connect()}
        </Button>
      ) : null}
      {detail.actions.canRetry ? (
        <Button disabled={waiting} onClick={onRetry}>
          {m.jira_migration_action_retry()}
        </Button>
      ) : null}
      {detail.actions.canConfigure &&
      (detail.destinationProjectSlug === null ||
        detail.failedAttachmentIds.length > 0) &&
      onReconfigure ? (
        <Button variant="tertiary" disabled={waiting} onClick={onReconfigure}>
          {detail.failedAttachmentIds.length > 0
            ? m.jira_migration_action_skip_failed_files()
            : m.jira_migration_action_reconfigure()}
        </Button>
      ) : null}
      {detail.actions.canRescan ? (
        <Button variant="tertiary" disabled={waiting} onClick={onRescan}>
          {m.jira_migration_action_rescan()}
        </Button>
      ) : null}
      {detail.actions.canDiscard || discardBlocked ? (
        <Button
          variant="ghost"
          disabled={waiting || discardBlocked}
          onClick={onDiscard}
        >
          {discardBlocked
            ? m.jira_migration_action_discard_unavailable()
            : m.jira_migration_action_discard()}
        </Button>
      ) : null}
    </TerminalSurface>
  )
}

function SkippedAttachments({
  orgSlug,
  migrationId
}: Readonly<{ orgSlug: string; migrationId: string }>) {
  const skippedAtom = jiraSkippedAttachmentsAtom(
    jiraMigrationKey(orgSlug, migrationId)
  )
  const result = useAtomValue(skippedAtom)
  const refreshSkipped = useAtomRefresh(skippedAtom)
  return Result.matchWithError(result, {
    onInitial: () => (
      <p className="mt-6 text-sm text-muted-foreground">
        {m.jira_migration_skipped_loading()}
      </p>
    ),
    onError: (error) => (
      <ErrorPage error={error} reset={refreshSkipped} contained />
    ),
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refreshSkipped} contained />
    ),
    onSuccess: ({ value }) =>
      value.length === 0 ? null : (
        <section className="mt-8 text-left">
          <h3 className="text-sm font-semibold text-foreground">
            {m.jira_migration_skipped_title()}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {m.jira_migration_success_skipped()}
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {value.map((attachment) => (
              <li key={attachment.sourceAttachmentId} className="py-3">
                <div className="min-w-0 font-mono text-[13px] break-all text-foreground">
                  {attachment.filename}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a
                    href={attachment.sourceIssueUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {m.jira_migration_skipped_jira_issue({
                      issueKey: attachment.sourceIssueKey
                    })}
                  </a>
                  <a
                    href={attachment.targetTicketUrl}
                    className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {m.jira_migration_skipped_ticket({
                      ticketId: attachment.targetTicketId
                    })}
                  </a>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {replacementMessage(attachment.replacement)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )
  })
}

function replacementMessage(
  replacement: JiraSkippedAttachment["replacement"]
): string {
  switch (replacement) {
    case "available":
      return m.jira_migration_skipped_can_replace()
    case "too_large":
      return m.jira_migration_skipped_too_large()
    case "unsupported_type":
      return m.jira_migration_skipped_type_unavailable()
  }
}

type TerminalSurfaceProps = Readonly<{
  title: string
  description: string
  details?: React.ReactNode
  error?: string | null
  children: React.ReactNode
}>

function TerminalSurface({
  title,
  description,
  details,
  error,
  children
}: TerminalSurfaceProps) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-xl">
        <h2 className="text-xl font-semibold tracking-tight text-balance text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
        {details}
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      </div>
    </div>
  )
}

function failureDescription(failure: JiraMigrationDetail["failure"]): string {
  if (failure === null) return m.jira_migration_failed_description()
  if (failure.reason === "preflight_blocked") {
    return m.jira_migration_failure_preflight_blocked()
  }
  if (failure.reason === "jira_migration_preparation_invalid") {
    return m.jira_migration_failure_preparation_invalid()
  }
  if (failure.reason === "storage_unavailable") {
    return m.jira_migration_failure_storage_unavailable()
  }
  if (failure.reason === "internal_error") {
    return m.jira_migration_failure_internal_error()
  }
  return m.jira_migration_failure_generic({ reason: failure.reason })
}
