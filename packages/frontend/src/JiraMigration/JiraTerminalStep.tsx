import type { JiraMigrationDetail } from "@projectproject/shared"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function JiraTerminalStep({
  detail,
  orgSlug,
  waiting,
  onRetry,
  onReconfigure,
  onRescan,
  onDiscard
}: {
  detail: JiraMigrationDetail
  orgSlug: string
  waiting: boolean
  onRetry?: () => void
  onReconfigure?: () => void
  onRescan?: () => void
  onDiscard?: () => void
}) {
  if (detail.status === "succeeded") {
    return (
      <TerminalSurface
        title={m.jira_migration_success_title()}
        description={m.jira_migration_success_description()}
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
    <TerminalSurface title={title} description={description}>
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
      {!detail.actions.canRetry &&
      detail.actions.canConfigure &&
      onReconfigure ? (
        <Button disabled={waiting} onClick={onReconfigure}>
          {m.jira_migration_action_reconfigure()}
        </Button>
      ) : null}
      {detail.actions.canRescan ? (
        <Button variant="tertiary" disabled={waiting} onClick={onRescan}>
          {m.jira_migration_action_rescan()}
        </Button>
      ) : null}
      {detail.actions.canDiscard ? (
        <Button variant="ghost" disabled={waiting} onClick={onDiscard}>
          {m.jira_migration_action_discard()}
        </Button>
      ) : null}
    </TerminalSurface>
  )
}

function TerminalSurface({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
          {description}
        </p>
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
  if (failure.reason === "storage_unavailable") {
    return m.jira_migration_failure_storage_unavailable()
  }
  return m.jira_migration_failure_generic({ reason: failure.reason })
}
