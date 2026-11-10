import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import {
  jiraMigrations,
  jiraOrgRequest
} from "@/features/jira/atoms/jiraMigration"
import { useJiraImportsPolling } from "@/features/jira/hooks/useJiraMigrationPolling"
import {
  isActiveJiraImport,
  isFinishedJiraImport,
  jiraImportStatusLabel
} from "@/features/jira/lib/stages"
import { textLinkClass } from "@/lib/textLink"
import { m } from "@/paraglide/messages"

export function ActiveImports({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(jiraMigrations(jiraOrgRequest(orgSlug)))
  const open = AsyncResult.isSuccess(result)
    ? result.value.filter((summary) => !isFinishedJiraImport(summary.status))
    : []
  useJiraImportsPolling(
    orgSlug,
    open.some((summary) => isActiveJiraImport(summary.status))
  )
  const [only] = open
  if (only === undefined) return null
  return (
    <p>
      {open.length === 1 ? (
        <Link
          to="/orgs/$orgSlug/migrations/jira/$migrationId"
          params={{ orgSlug, migrationId: only.id }}
          className={textLinkClass}
        >
          {m.jira_import_projects_one({
            source: only.sourceProjectKey,
            destination: only.destination?.name ?? only.sourceProjectName,
            status: jiraImportStatusLabel(only.status)
          })}
        </Link>
      ) : (
        <Link
          to="/orgs/$orgSlug/migrations/jira"
          params={{ orgSlug }}
          className={textLinkClass}
        >
          {m.jira_import_projects_many({ count: open.length })}
        </Link>
      )}
    </p>
  )
}
