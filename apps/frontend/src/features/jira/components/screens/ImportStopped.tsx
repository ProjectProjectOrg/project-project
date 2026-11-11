import type { JiraMigrationDetail } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { JiraImportLifecycle } from "@/features/jira/hooks/useJiraImportLifecycle"
import { jiraConnectHref } from "@/features/jira/lib/connect"
import {
  jiraFailurePlan,
  jiraStoppedActions,
  type JiraFailureAction,
  type JiraFailureKind
} from "@/features/jira/lib/failure"
import type { JiraStoppedKind } from "@/features/jira/lib/screen"
import { m } from "@/paraglide/messages"

import { ConfirmAction } from "../ConfirmAction"
import { JiraFindings } from "../Findings"
import { StepFrame } from "../StepFrame"

type StoppedCopy = Readonly<{
  title: () => string
  description: () => string
}>

const failureCopy: Readonly<Record<JiraFailureKind, StoppedCopy>> = {
  jira_unreachable: {
    title: m.jira_import_failure_unreachable_title,
    description: m.jira_import_failure_unreachable_description
  },
  jira_response: {
    title: m.jira_import_failure_response_title,
    description: m.jira_import_failure_response_description
  },
  jira_rate_limited: {
    title: m.jira_import_failure_rate_limited_title,
    description: m.jira_import_failure_rate_limited_description
  },
  jira_access: {
    title: m.jira_import_failure_access_title,
    description: m.jira_import_failure_access_description
  },
  project_access_lost: {
    title: m.jira_import_failure_project_access_title,
    description: m.jira_import_failure_project_access_description
  },
  project_not_found: {
    title: m.jira_import_failure_project_gone_title,
    description: m.jira_import_failure_project_gone_description
  },
  storage: {
    title: m.jira_import_failure_storage_title,
    description: m.jira_import_failure_storage_description
  },
  file_write: {
    title: m.jira_import_failure_file_write_title,
    description: m.jira_import_failure_file_write_description
  },
  service_unavailable: {
    title: m.jira_import_failure_service_title,
    description: m.jira_import_failure_service_description
  },
  stalled: {
    title: m.jira_import_failure_stalled_title,
    description: m.jira_import_failure_stalled_description
  },
  paused: {
    title: m.jira_import_failure_paused_title,
    description: m.jira_import_failure_paused_description
  },
  setup: {
    title: m.jira_import_failure_setup_title,
    description: m.jira_import_failure_setup_description
  },
  attachments: {
    title: m.jira_import_failure_attachments_title,
    description: m.jira_import_failure_attachments_description
  },
  scan_incomplete: {
    title: m.jira_import_failure_scan_title,
    description: m.jira_import_failure_scan_description
  },
  superseded: {
    title: m.jira_import_failure_superseded_title,
    description: m.jira_import_failure_superseded_description
  },
  verification: {
    title: m.jira_import_failure_verification_title,
    description: m.jira_import_failure_verification_description
  },
  internal: {
    title: m.jira_import_failure_internal_title,
    description: m.jira_import_failure_internal_description
  },
  unknown: {
    title: m.jira_import_failure_unknown_title,
    description: m.jira_import_failure_unknown_description
  }
}

const stoppedCopy: Readonly<Record<"cancelled" | "unavailable", StoppedCopy>> =
  {
    cancelled: {
      title: m.jira_import_cancelled_title,
      description: m.jira_import_cancelled_description
    },
    unavailable: {
      title: m.jira_import_unavailable_title,
      description: m.jira_import_unavailable_description
    }
  }

const actionLabels: Readonly<Record<JiraFailureAction, () => string>> = {
  retry: m.jira_import_action_retry,
  reconnect: m.jira_import_action_connect,
  connect_storage: m.jira_import_action_connect_storage,
  fix_setup: m.jira_import_action_fix_setup,
  leave_out_files: m.jira_import_action_leave_out_files,
  scan_again: m.jira_import_action_scan_again
}

export function ImportStopped({
  orgSlug,
  detail,
  kind,
  lifecycle,
  onFixSetup,
  onLeaveOutFiles
}: Readonly<{
  orgSlug: string
  detail: JiraMigrationDetail
  kind: JiraStoppedKind
  lifecycle: JiraImportLifecycle
  onFixSetup: () => void
  onLeaveOutFiles: () => void
}>) {
  const plan = jiraFailurePlan(detail)
  const failed = kind === "failed"
  const copy = kind === "failed" ? failureCopy[plan.kind] : stoppedCopy[kind]
  const actions = jiraStoppedActions(detail, kind)
  const returnPath = `/orgs/${orgSlug}/migrations/jira/${detail.id}`
  const handlers: Readonly<
    Record<"retry" | "fix_setup" | "leave_out_files" | "scan_again", () => void>
  > = {
    retry: () => void lifecycle.run(),
    fix_setup: onFixSetup,
    leave_out_files: onLeaveOutFiles,
    scan_again: () => void lifecycle.rescan()
  }
  const renderAction = (action: JiraFailureAction): ReactNode => {
    const primary = action === actions[0]
    const variant = primary ? "primary" : "tertiary"
    const label = actionLabels[action]()
    if (action === "connect_storage")
      return (
        <Button
          key={action}
          variant={variant}
          render={
            <Link to="/orgs/$orgSlug/settings/storage" params={{ orgSlug }} />
          }
        >
          {label}
        </Button>
      )
    if (action === "reconnect")
      return (
        <Button
          key={action}
          variant={variant}
          render={<a href={jiraConnectHref(returnPath)} aria-label={label} />}
        >
          {label}
        </Button>
      )
    return (
      <Button
        key={action}
        variant={variant}
        loading={primary && lifecycle.waiting}
        disabled={lifecycle.waiting}
        onClick={handlers[action]}
      >
        {label}
      </Button>
    )
  }
  const subject = failed ? (detail.failure?.subject ?? null) : null
  const findings = detail.findings ?? []

  return (
    <StepFrame
      title={copy.title()}
      description={copy.description()}
      start={
        detail.actions.canDiscard ? (
          <ConfirmAction
            variant="ghost"
            bleed="start"
            trigger={m.jira_import_action_discard()}
            prompt={m.jira_import_discard_prompt()}
            label={m.jira_import_action_discard()}
            disabled={lifecycle.waiting}
            onConfirm={lifecycle.discard}
          />
        ) : undefined
      }
      error={lifecycle.error}
      end={<>{actions.toReversed().map(renderAction)}</>}
    >
      <div className="flex flex-col gap-6">
        {subject === null ? null : (
          <p className="text-body text-foreground">
            {m.jira_import_failure_subject({ subject })}
          </p>
        )}
        {failed && !detail.actions.canDiscard ? (
          <p className="max-w-[65ch] text-caption text-muted-foreground">
            {m.jira_import_discard_later()}
          </p>
        ) : null}
        {findings.length === 0 ? null : (
          <JiraFindings findings={findings} project={null} />
        )}
      </div>
    </StepFrame>
  )
}
