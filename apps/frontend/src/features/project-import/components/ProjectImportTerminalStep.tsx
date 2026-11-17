import type { ProjectImport } from "@pp/shared"
import { Link } from "@tanstack/react-router"

import { TerminalSurface } from "@/components/shell/TerminalSurface"
import { Button } from "@/components/ui/button"
import {
  importFailureMessage,
  integrationList
} from "@/features/project-import/lib/presentation"
import { m } from "@/paraglide/messages"

export function ProjectImportTerminalStep({
  orgSlug,
  imported,
  onRetry
}: Readonly<{
  orgSlug: string
  imported: ProjectImport
  onRetry?: () => void
}>) {
  if (imported.status === "uploading" || imported.status === "importing") {
    return (
      <TerminalSurface
        title={m.project_import_importing_title()}
        description={m.project_import_importing_description()}
      >
        <span className="animate-pulse text-body text-muted-foreground">
          {m.project_import_importing_waiting()}
        </span>
      </TerminalSurface>
    )
  }

  if (imported.status === "succeeded") {
    return (
      <TerminalSurface
        title={m.project_import_success_title()}
        description={
          imported.integrations.length > 0
            ? m.project_import_success_reconnect({
                integrations: integrationList(imported.integrations)
              })
            : m.project_import_success_description()
        }
      >
        {imported.destination ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug"
                  params={{ orgSlug, slug: imported.destination.slug }}
                />
              }
            >
              {m.project_import_action_open_project()}
            </Button>
            <Button
              variant="tertiary"
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/references"
                  params={{ orgSlug, slug: imported.destination.slug }}
                />
              }
            >
              {m.project_references_import_action()}
            </Button>
          </div>
        ) : null}
      </TerminalSurface>
    )
  }

  if (imported.status === "cancelled") {
    return (
      <TerminalSurface
        title={m.project_import_cancelled_title()}
        description={m.project_import_cancelled_description()}
      >
        <StartOverButton orgSlug={orgSlug} />
      </TerminalSurface>
    )
  }

  return (
    <TerminalSurface
      title={m.project_import_failed_title()}
      description={importFailureMessage(imported.failureReason)}
    >
      {imported.source !== null && onRetry ? (
        <Button onClick={onRetry}>{m.project_import_action_retry()}</Button>
      ) : (
        <StartOverButton orgSlug={orgSlug} />
      )}
    </TerminalSurface>
  )
}

function StartOverButton({ orgSlug }: Readonly<{ orgSlug: string }>) {
  return (
    <Button
      variant="tertiary"
      render={
        <Link to="/orgs/$orgSlug/imports/projectproject" params={{ orgSlug }} />
      }
    >
      {m.project_import_action_start_over()}
    </Button>
  )
}
